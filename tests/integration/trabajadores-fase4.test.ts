import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { parseFiltros } from "@/lib/busqueda";
import { AuthError } from "@/server/auth/authorize";
import { loadUser, upsertUserFromLogin, type AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { DomainError } from "@/server/errors";
import type { RequestContext } from "@/server/http/request-info";
import { searchWorkers } from "@/server/search/workers";
import { signedUrl } from "@/server/storage/files";
import { issueActivationCode, redeemActivationCode } from "@/server/workers/activation";
import {
  changeWorkerStatus,
  createWorker,
  getWorkerDetail,
  getWorkerForEdit,
  getWorkerFormOptions,
  searchWorkersAdmin,
  updateWorker,
} from "@/server/workers/admin";
import { documentAccessUrl, listDocumentTypes, reviewDocument, uploadDocument } from "@/server/workers/documents";
import {
  getOwnWorker,
  proposeOwnPhoto,
  readPublicWorkerPhoto,
  reviewWorkerPhoto,
  setOwnAvailability,
} from "@/server/workers/public-profile";
import { enrollWorker, listTrainings, trainingQueue, updateEnrollment } from "@/server/workers/training";

/** Integración de la Fase 4 contra Supabase local (base + Storage). Requiere `pnpm db:reset`. */

const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-f4" };
const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(7)]);

async function usuario(roles: string[]): Promise<AppUser> {
  const { user } = await upsertUserFromLogin({
    issuer: ISS,
    sub: randomUUID(),
    provider: "COGNITO",
    emailVerified: true,
  });
  if (roles.length)
    await getAdminDb()
      .from("user_roles")
      .insert(roles.map((r) => ({ user_id: user.id, role_code: r })));
  return (await loadUser(user.id)) as AppUser;
}

async function auditoria(action: string, resourceId: string) {
  const { data } = await getAdminDb()
    .from("audit_log")
    .select("action, actor_id, result, metadata")
    .eq("action", action)
    .eq("resource_id", resourceId);
  return data ?? [];
}

function archivo(bytes: Uint8Array<ArrayBuffer>, nombre: string, tipo: string) {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

let admin: AppUser;
let operador: AppUser;
let capacitador: AppUser;
let plomeria: string;

beforeAll(async () => {
  admin = await usuario(["ADMIN_TRABAJADORES", "RESP_CAPACITACION"]);
  operador = await usuario(["OPERADOR_PUNTO"]);
  capacitador = await usuario(["RESP_CAPACITACION"]);
  const { data } = await getAdminDb().from("services").select("id").eq("slug", "plomeria").single();
  plomeria = data!.id;
});

function formulario(marca: string, extra: Record<string, unknown> = {}) {
  return {
    firstNames: "Prueba",
    lastNames: marca,
    phone: `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    publicDisplayName: `Prueba ${marca}`,
    specialty: `Especialidad ${marca}`,
    services: [plomeria],
    primaryService: plomeria,
    yearsExperience: "4",
    isAvailable: "on",
    ...extra,
  };
}

/** Lleva un trabajador recién registrado hasta HABILITADO por el camino completo. */
async function habilitar(id: string) {
  await changeWorkerStatus(admin, { workerId: id, to: "PENDIENTE_REVISION" }, ctx);
  await changeWorkerStatus(admin, { workerId: id, to: "CAPACITACION_PENDIENTE" }, ctx);
  const { data: curso } = await getAdminDb().from("trainings").select("id").eq("code", "GENERAL").single();
  const inscripcion = await enrollWorker(admin, { workerId: id, trainingId: curso!.id }, ctx);
  await updateEnrollment(admin, { enrollmentId: inscripcion, status: "APROBADO", score: "90" }, ctx);
  await changeWorkerStatus(admin, { workerId: id, to: "HABILITADO" }, ctx);
}

describe("alta presencial", () => {
  it("registra, avisa duplicados y solo crea el segundo si el operador confirma", async () => {
    const marca = `dup${randomUUID().slice(0, 6)}`;
    const phone = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const primero = await createWorker(operador, formulario(marca, { phone }), ctx);
    expect(primero.status).toBe("created");

    const segundo = await createWorker(operador, formulario(marca, { phone }), ctx);
    expect(segundo.status).toBe("duplicates");
    if (segundo.status === "duplicates") {
      const c = segundo.candidates.find((x) => primero.status === "created" && x.id === primero.id);
      expect(c?.reasons).toEqual(expect.arrayContaining(["TELEFONO", "NOMBRES"]));
    }

    const confirmado = await createWorker(operador, formulario(marca, { phone, duplicatesConfirmed: "on" }), ctx);
    expect(confirmado.status).toBe("created");
    if (confirmado.status === "created") {
      const [a] = await auditoria("WORKER_CREATED", confirmado.id);
      expect(a.metadata).toMatchObject({ duplicatesConfirmed: true });
    }
  });

  it("un supervisor sin worker.create no registra", async () => {
    const supervisor = await usuario(["SUPERVISOR"]);
    await expect(createWorker(supervisor, formulario("x"), ctx)).rejects.toBeInstanceOf(AuthError);
  });

  it("los datos personales solo se ven con worker.read.private y su consulta se audita", async () => {
    const r = await createWorker(operador, formulario(`priv${randomUUID().slice(0, 6)}`), ctx);
    if (r.status !== "created") throw new Error("no creado");
    const conPermiso = await getWorkerDetail(admin, r.id, ctx);
    expect(conPermiso.private?.phone).toMatch(/^09/);
    expect((await auditoria("WORKER_PRIVATE_DATA_VIEWED", r.id)).length).toBe(1);

    const sinPermiso = await getWorkerDetail(capacitador, r.id, ctx);
    expect(sinPermiso.private).toBeNull();
    expect((await auditoria("WORKER_PRIVATE_DATA_VIEWED", r.id)).length).toBe(1);

    const lista = await searchWorkersAdmin(capacitador, { q: sinPermiso.displayName });
    expect(lista.items[0]).toMatchObject({ legalName: null, phone: null });
  });
});

describe("documentos en Storage privado", () => {
  let workerId: string;
  beforeAll(async () => {
    const r = await createWorker(operador, formulario(`doc${randomUUID().slice(0, 6)}`), ctx);
    if (r.status !== "created") throw new Error("no creado");
    workerId = r.id;
  });

  function datos(file: File, typeCode = "CERT_OFICIO") {
    const fd = new FormData();
    fd.set("workerId", workerId);
    fd.set("typeCode", typeCode);
    fd.set("file", file);
    return fd;
  }

  it("sube un PDF real, lo registra PENDIENTE y lo audita", async () => {
    const id = await uploadDocument(operador, datos(archivo(PDF, "certificado.pdf", "application/pdf")), ctx);
    const { data } = await getAdminDb()
      .from("worker_documents")
      .select("status, mime_type, storage_path")
      .eq("id", id)
      .single();
    expect(data).toMatchObject({ status: "PENDIENTE", mime_type: "application/pdf" });
    expect(data!.storage_path).toMatch(new RegExp(`^workers/${workerId}/documents/[0-9a-f-]{36}\\.pdf$`));
    expect(await auditoria("DOCUMENT_UPLOADED", id)).toHaveLength(1);
  });

  it("rechaza un archivo con MIME falso (HTML declarado como PDF) sin subir nada", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const antes = await getAdminDb().storage.from("worker-files").list(`workers/${workerId}/documents`);
    await expect(
      uploadDocument(operador, datos(archivo(html, "falso.pdf", "application/pdf")), ctx),
    ).rejects.toBeInstanceOf(DomainError);
    const despues = await getAdminDb().storage.from("worker-files").list(`workers/${workerId}/documents`);
    expect(despues.data?.length).toBe(antes.data?.length);
  });

  it("no acepta dos veces el mismo archivo para el mismo trabajador", async () => {
    const png = new Uint8Array([...PNG, 1, 2, 3]);
    await uploadDocument(operador, datos(archivo(png, "a.png", "image/png"), "OTRO"), ctx);
    await expect(
      uploadDocument(operador, datos(archivo(png, "b.png", "image/png"), "OTRO"), ctx),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("el bucket es privado: sin firma no se descarga; la URL firmada funciona y EXPIRA", async () => {
    const id = await uploadDocument(
      operador,
      datos(archivo(new Uint8Array([...PDF, 9]), "exp.pdf", "application/pdf")),
      ctx,
    );
    const { data } = await getAdminDb().from("worker_documents").select("storage_path").eq("id", id).single();
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await fetch(`${base}/storage/v1/object/public/worker-files/${data!.storage_path}`)).ok).toBe(false);

    const url = await documentAccessUrl(admin, workerId, id, ctx);
    expect((await fetch(url)).status).toBe(200);
    expect(await auditoria("DOCUMENT_ACCESSED", id)).toHaveLength(1);

    const corta = await signedUrl(data!.storage_path, 1);
    await new Promise((r) => setTimeout(r, 2500));
    expect((await fetch(corta)).ok).toBe(false);
  }, 15000);

  it("sin document.read no se abre (y el intento denegado se audita); el operador abre lo que subió", async () => {
    const id = await uploadDocument(
      operador,
      datos(archivo(new Uint8Array([...PDF, 8]), "c.pdf", "application/pdf")),
      ctx,
    );
    await expect(documentAccessUrl(capacitador, workerId, id, ctx)).rejects.toBeInstanceOf(AuthError);
    expect((await auditoria("DOCUMENT_ACCESSED", id)).map((a) => a.result)).toEqual(["DENIED"]);
    await expect(documentAccessUrl(operador, workerId, id, ctx)).resolves.toMatch(/token=/);
  });

  it("la revisión exige permiso y motivo al rechazar", async () => {
    const id = await uploadDocument(
      operador,
      datos(archivo(new Uint8Array([...PDF, 7]), "r.pdf", "application/pdf")),
      ctx,
    );
    await expect(reviewDocument(operador, { documentId: id, status: "VALIDADO" }, ctx)).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(reviewDocument(admin, { documentId: id, status: "RECHAZADO" }, ctx)).rejects.toThrow();
    await reviewDocument(admin, { documentId: id, status: "RECHAZADO", note: "Documento ilegible" }, ctx);
    expect(await auditoria("DOCUMENT_REJECTED", id)).toHaveLength(1);
  });
});

describe("habilitación y visibilidad pública", () => {
  it("habilitado aparece en la búsqueda; suspendido desaparece de inmediato; reactivar exige motivo", async () => {
    const marca = `vis${randomUUID().slice(0, 6)}`;
    const r = await createWorker(operador, formulario(marca), ctx);
    if (r.status !== "created") throw new Error("no creado");
    const buscar = () => searchWorkers(parseFiltros({ q: marca }));

    await expect(changeWorkerStatus(admin, { workerId: r.id, to: "HABILITADO" }, ctx)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect((await buscar()).total).toBe(0);

    await habilitar(r.id);
    expect((await buscar()).items.map((w) => w.id)).toEqual([r.id]);
    expect(await auditoria("WORKER_ENABLED", r.id)).toHaveLength(1);

    await changeWorkerStatus(admin, { workerId: r.id, to: "SUSPENDIDO", reason: "Denuncia grave en revisión" }, ctx);
    expect((await buscar()).total).toBe(0);
    expect(await auditoria("WORKER_SUSPENDED", r.id)).toHaveLength(1);

    await expect(changeWorkerStatus(admin, { workerId: r.id, to: "HABILITADO" }, ctx)).rejects.toBeInstanceOf(
      DomainError,
    );
    await changeWorkerStatus(admin, { workerId: r.id, to: "HABILITADO", reason: "Denuncia descartada" }, ctx);
    expect((await buscar()).total).toBe(1);
    expect(await auditoria("WORKER_REACTIVATED", r.id)).toHaveLength(1);
  });

  it("el responsable de capacitación no habilita (worker.enable)", async () => {
    const r = await createWorker(operador, formulario(`perm${randomUUID().slice(0, 6)}`), ctx);
    if (r.status !== "created") throw new Error("no creado");
    await expect(
      changeWorkerStatus(capacitador, { workerId: r.id, to: "RECHAZADO", reason: "No corresponde" }, ctx),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("código de activación y perfil del trabajador", () => {
  it("vincula la cuenta con un código de un solo uso, limita intentos y permite la edición limitada", async () => {
    const marca = `act${randomUUID().slice(0, 6)}`;
    const r = await createWorker(operador, formulario(marca), ctx);
    if (r.status !== "created") throw new Error("no creado");

    const viejo = await issueActivationCode(operador, r.id, ctx);
    const { code } = await issueActivationCode(operador, r.id, ctx);
    const trabajador = await usuario(["CLIENTE"]);

    // El código anterior quedó anulado al emitir uno nuevo.
    await expect(redeemActivationCode(trabajador, viejo.code, ctx)).rejects.toMatchObject({ code: "expired" });
    await expect(redeemActivationCode(trabajador, "ZZZZ-ZZZZ", ctx)).rejects.toMatchObject({ code: "invalid" });

    const res = await redeemActivationCode(trabajador, code.toLowerCase(), ctx);
    expect(res).toEqual({ result: "LINKED", workerId: r.id });
    expect((await loadUser(trabajador.id))?.roles).toContain("TRABAJADOR");
    expect(await auditoria("WORKER_ACCOUNT_LINKED", r.id)).toHaveLength(1);

    // Un código ya usado no sirve a otra persona.
    const otro = await usuario(["CLIENTE"]);
    await expect(redeemActivationCode(otro, code, ctx)).rejects.toMatchObject({ code: "expired" });

    // Edición limitada: disponibilidad directa, foto pendiente de aprobación.
    await setOwnAvailability(trabajador, { isAvailable: false }, ctx);
    await proposeOwnPhoto(trabajador, archivo(PNG, "yo.png", "image/png"), ctx);
    const propio = await getOwnWorker(trabajador.id);
    expect(propio).toMatchObject({ isAvailable: false, photo: { hasPending: true, hasApproved: false } });

    await habilitar(r.id);
    expect(await readPublicWorkerPhoto(r.id)).toBeNull(); // pendiente: aún no es pública
    await reviewWorkerPhoto(admin, { workerId: r.id, decision: "APROBAR" }, ctx);
    const foto = await readPublicWorkerPhoto(r.id);
    expect(new Uint8Array(foto!.bytes).slice(0, 4)).toEqual(PNG.slice(0, 4));
    expect((await searchWorkers(parseFiltros({ q: marca }))).items[0]?.hasPhoto).toBe(true);

    await changeWorkerStatus(admin, { workerId: r.id, to: "INACTIVO", reason: "Baja voluntaria" }, ctx);
    expect(await readPublicWorkerPhoto(r.id)).toBeNull(); // sin habilitación, sin foto pública
  });

  it("bloquea el canje tras 5 intentos fallidos en 15 minutos", async () => {
    const u = await usuario(["CLIENTE"]);
    for (let i = 0; i < 5; i++) {
      await expect(redeemActivationCode(u, "ZZZZ-ZZZ2", ctx)).rejects.toMatchObject({ status: 422 });
    }
    await expect(redeemActivationCode(u, "ZZZZ-ZZZ2", ctx)).rejects.toMatchObject({ status: 429 });
  });
});

describe("datos de las pantallas del panel", () => {
  it("opciones del formulario, tipos de documento y cursos", async () => {
    const op = await getWorkerFormOptions();
    expect(op.services.length).toBeGreaterThanOrEqual(10);
    expect(op.services[0]).toMatchObject({ category: expect.any(String) });
    expect(op.parishes).toHaveLength(27);
    expect((await listDocumentTypes()).map((t) => t.code)).toContain("ANTECEDENTES_PENALES");
    expect((await listTrainings({ onlyActive: true })).find((t) => t.code === "GENERAL")).toMatchObject({
      required: true,
    });
  });

  it("edita datos y oficios, audita los campos cambiados y aparece en la bandeja de capacitación", async () => {
    const r = await createWorker(operador, formulario(`edit${randomUUID().slice(0, 6)}`), ctx);
    if (r.status !== "created") throw new Error("no creado");
    const ficha = await getWorkerForEdit(admin, r.id, ctx);
    const { data: pintura } = await getAdminDb().from("services").select("id").eq("slug", "pintura").single();
    await updateWorker(
      admin,
      r.id,
      {
        ...ficha.values,
        specialty: "Nueva especialidad",
        services: [plomeria, pintura!.id],
        primaryService: pintura!.id,
        isAvailable: "on",
      },
      ctx,
    );
    const [a] = await auditoria("WORKER_UPDATED", r.id);
    expect(a.metadata.fields).toEqual(expect.arrayContaining(["specialty", "services"]));
    expect(a.metadata.fields).not.toContain("phone");
    expect((await getWorkerDetail(admin, r.id, ctx)).services.find((s) => s.isPrimary)?.slug).toBe("pintura");

    await changeWorkerStatus(admin, { workerId: r.id, to: "PENDIENTE_REVISION" }, ctx);
    await changeWorkerStatus(admin, { workerId: r.id, to: "CAPACITACION_PENDIENTE" }, ctx);
    expect((await trainingQueue(capacitador)).map((w) => w.id)).toContain(r.id);
  });
});
