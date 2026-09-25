import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseFiltros } from "@/lib/busqueda";
import { AuthError } from "@/server/auth/authorize";
import { loadUser, upsertUserFromLogin, type AppUser } from "@/server/auth/users";
import { getPublicCatalog, getPublicService, listParishes, saveCategory, saveService } from "@/server/catalog/catalog";
import { getAdminDb } from "@/server/db/admin";
import type { RequestContext } from "@/server/http/request-info";
import { getPublicWorker, searchWorkers } from "@/server/search/workers";

/** Integración de la Fase 3 contra Supabase local con el seed de desarrollo (`pnpm db:reset`). */

const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-f3" };
const buscar = (params: Record<string, string>) => searchWorkers(parseFiltros(params));

/** Crea un trabajador con un término único para aislar las búsquedas del seed. */
async function crearTrabajador(opciones: { status?: string; marca: string; servicio?: string; disponible?: boolean }) {
  const db = getAdminDb();
  const { data, error } = await db
    .from("worker_profiles")
    .insert({
      first_names: "Prueba",
      last_names: opciones.marca,
      phone: "0991112233",
      email: "privado@test.ec",
      address: "Calle secreta 123",
      public_display_name: `Prueba ${opciones.marca}`,
      specialty: `Especialidad ${opciones.marca}`,
      years_experience: 7,
      is_available: opciones.disponible ?? true,
      status: opciones.status ?? "HABILITADO",
    })
    .select("id")
    .single();
  if (error) throw error;
  if (opciones.servicio) {
    const { data: s } = await db.from("services").select("id").eq("slug", opciones.servicio).single();
    await db.from("worker_services").insert({ worker_id: data.id, service_id: s!.id, is_primary: true });
  }
  return data.id as string;
}

async function admin(): Promise<AppUser> {
  const { user } = await upsertUserFromLogin({
    issuer: "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool",
    sub: randomUUID(),
    provider: "COGNITO",
    emailVerified: true,
  });
  await getAdminDb().from("user_roles").insert({ user_id: user.id, role_code: "ADMIN_SISTEMA" });
  return (await loadUser(user.id)) as AppUser;
}

describe("búsqueda pública de trabajadores", () => {
  it("ignora tildes y mayúsculas, y encuentra por raíz (plomero → plomería)", async () => {
    const a = await buscar({ q: "plomeria" });
    const b = await buscar({ q: "PLOMERÍA" });
    const c = await buscar({ q: "plomero" });
    expect(a.total).toBeGreaterThan(0);
    expect(b.items.map((w) => w.id)).toEqual(a.items.map((w) => w.id));
    expect(c.items.map((w) => w.id).sort()).toEqual(a.items.map((w) => w.id).sort());
  });

  it("tolera errores de tipeo (electrisista)", async () => {
    const r = await buscar({ q: "electrisista" });
    expect(r.items.some((w) => w.services.some((s) => s.slug === "electricidad"))).toBe(true);
  });

  it("un trabajador no habilitado NUNCA aparece; al habilitarlo sí", async () => {
    const marca = `zq${randomUUID().slice(0, 6)}`;
    const id = await crearTrabajador({ status: "CAPACITACION_EN_PROCESO", marca });
    expect((await buscar({ q: marca })).total).toBe(0);
    await expect(getPublicWorker(id)).resolves.toBeNull();

    await getAdminDb().from("worker_profiles").update({ status: "HABILITADO" }).eq("id", id);
    expect((await buscar({ q: marca })).items.map((w) => w.id)).toEqual([id]);
    await expect(getPublicWorker(id)).resolves.not.toBeNull();
  });

  it("nunca expone datos privados (teléfono, email, dirección, nombres legales)", async () => {
    const marca = `zp${randomUUID().slice(0, 6)}`;
    const id = await crearTrabajador({ marca, servicio: "pintura" });
    const tarjeta = JSON.stringify(await buscar({ q: marca }));
    const perfil = JSON.stringify(await getPublicWorker(id));
    for (const texto of [tarjeta, perfil]) {
      expect(texto).not.toContain("0991112233");
      expect(texto).not.toContain("privado@test.ec");
      expect(texto).not.toContain("Calle secreta");
      expect(texto).not.toMatch(/"(phone|email|address|first_names|last_names|birth_date)"/);
    }
  });

  it("reindexa al asignar un oficio y combina filtros", async () => {
    const marca = `zr${randomUUID().slice(0, 6)}`;
    const id = await crearTrabajador({ marca, disponible: false });
    expect((await buscar({ oficio: "jardineria", q: marca })).total).toBe(0);

    const { data: s } = await getAdminDb().from("services").select("id").eq("slug", "jardineria").single();
    await getAdminDb().from("worker_services").insert({ worker_id: id, service_id: s!.id });
    expect((await buscar({ q: "jardineria " + marca })).items.map((w) => w.id)).toContain(id);
    expect((await buscar({ oficio: "jardineria", q: marca })).items.map((w) => w.id)).toEqual([id]);
    expect((await buscar({ oficio: "jardineria", q: marca, disponible: "1" })).total).toBe(0);
    expect((await buscar({ categoria: "hogar", q: marca })).total).toBe(1);
    expect((await buscar({ categoria: "cuidado", q: marca })).total).toBe(0);
  });

  it("filtra por parroquia, experiencia y calificación; ordena y pagina", async () => {
    const porParroquia = await buscar({ parroquia: "atocha-ficoa" });
    expect(porParroquia.items.every((w) => w.parish === "Atocha - Ficoa")).toBe(true);

    const expertos = await buscar({ experiencia: "10" });
    expect(expertos.items.every((w) => w.yearsExperience >= 10)).toBe(true);

    const altos = await buscar({ calificacion: "4" });
    expect(altos.items.every((w) => w.ratingAvg >= 4)).toBe(true);

    const porExperiencia = await buscar({ orden: "experiencia" });
    const anos = porExperiencia.items.map((w) => w.yearsExperience);
    expect(anos).toEqual([...anos].sort((a, b) => b - a));

    const todos = await buscar({});
    expect(todos.items.length).toBeLessThanOrEqual(todos.pageSize);
    if (todos.pages > 1) {
      const p2 = await buscar({ pagina: "2" });
      expect(p2.items[0]?.id).not.toBe(todos.items[0].id);
    }
  });

  it("filtros inválidos en la URL se ignoran sin romper", async () => {
    const r = await buscar({
      oficio: "no válido!!",
      experiencia: "-3",
      calificacion: "9",
      orden: "hack",
      pagina: "abc",
    });
    expect(r.page).toBe(1);
    expect(r.total).toBeGreaterThan(0);
  });
});

describe("catálogo", () => {
  it("catálogo público agrupado con conteo de habilitados y parroquias", async () => {
    const catalogo = await getPublicCatalog();
    expect(catalogo.map((c) => c.slug)).toEqual(expect.arrayContaining(["construccion", "hogar", "cuidado"]));
    const albanileria = await getPublicService("albanileria");
    expect(albanileria?.enabledWorkers).toBeGreaterThan(0);
    expect((await listParishes()).length).toBe(27);
  });

  it("administración: crea y edita con auditoría; desactivar oculta del catálogo público", async () => {
    const actor = await admin();
    const slug = `oficio-${randomUUID().slice(0, 6)}`;
    const categoria = (await getAdminDb().from("categories").select("id").eq("slug", "hogar").single()).data!.id;
    const id = await saveService(
      actor,
      {
        slug,
        name: "Oficio de prueba",
        categoryId: categoria,
        priceUnit: "HORA",
        color: "azul",
        priceMin: "10",
        priceMax: "20",
        active: "on",
      },
      ctx,
    );
    expect((await getPublicService(slug))?.name).toBe("Oficio de prueba");

    await saveService(
      actor,
      { id, slug, name: "Oficio de prueba", categoryId: categoria, priceUnit: "HORA", color: "azul" },
      ctx,
    );
    await expect(getPublicService(slug)).resolves.toBeNull(); // sin "active" → inactivo

    const { data: eventos } = await getAdminDb().from("audit_log").select("action").eq("resource_id", id);
    expect(eventos?.map((e) => e.action).sort()).toEqual(["SERVICE_CREATED", "SERVICE_UPDATED"]);
  });

  it("valida datos y exige catalog.manage", async () => {
    const actor = await admin();
    await expect(saveCategory(actor, { slug: "Con Espacios", name: "X", color: "azul" }, ctx)).rejects.toThrow();
    const { user } = await upsertUserFromLogin({
      issuer: "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool",
      sub: randomUUID(),
      provider: "COGNITO",
      emailVerified: false,
    });
    const cliente = (await loadUser(user.id)) as AppUser;
    await expect(saveCategory(cliente, { slug: "nueva", name: "Nueva", color: "azul" }, ctx)).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});
