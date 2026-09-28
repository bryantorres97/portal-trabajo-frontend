import { expect, test } from "@playwright/test";

/** Fase 4 — gestión de trabajadores: control de acceso de rutas y API (sin sesión). */

const WORKER_SEED = "00000000-0000-4000-a000-000000000001";

test.describe("Fase 4 — trabajadores", () => {
  for (const ruta of [
    "/admin/trabajadores",
    "/admin/trabajadores/nuevo",
    `/admin/trabajadores/${WORKER_SEED}`,
    `/admin/trabajadores/${WORKER_SEED}/editar`,
    "/admin/capacitacion",
  ]) {
    test(`${ruta} sin sesión redirige al ingreso del personal`, async ({ request }) => {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const destino = new URL(res.headers()["location"], "http://x");
      expect(destino.pathname).toBe("/admin/ingresar");
      expect(destino.searchParams.get("returnTo")).toBe(ruta);
    });
  }

  test("un documento sin sesión no se entrega (redirige al ingreso del personal)", async ({ request }) => {
    const res = await request.get(`/admin/trabajadores/${WORKER_SEED}/documentos/${WORKER_SEED}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/admin/ingresar");
  });

  test("la foto del panel: sin cookie redirige; con una sesión inválida responde 403", async ({ request }) => {
    const ruta = `/admin/trabajadores/${WORKER_SEED}/foto?v=pending`;
    const sinCookie = await request.get(ruta, { maxRedirects: 0 });
    expect(sinCookie.status()).toBe(307);
    const invalida = await request.get(ruta, {
      headers: { cookie: "llankana_session=invalida; __Host-llankana_session=invalida" },
      maxRedirects: 0,
    });
    expect(invalida.status()).toBe(403);
  });

  test("/cuenta/trabajador sin sesión pide iniciar sesión", async ({ request }) => {
    const res = await request.get("/cuenta/trabajador", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/api/auth/login?returnTo=%2Fcuenta%2Ftrabajador");
  });

  test("la API del trabajador exige autenticación", async ({ request }) => {
    expect((await request.get("/api/v1/me/worker")).status()).toBe(401);
    const link = await request.post("/api/v1/me/worker/link", {
      data: { code: "ABCD-2345" },
      headers: { origin: "http://evil.example" },
    });
    expect(link.status()).toBe(403);
  });

  test("la foto pública de un trabajador sin foto aprobada responde 404", async ({ request }) => {
    expect((await request.get(`/api/v1/workers/${WORKER_SEED}/photo`)).status()).toBe(404);
    expect((await request.get("/api/v1/workers/no-es-uuid/photo")).status()).toBe(404);
  });
});
