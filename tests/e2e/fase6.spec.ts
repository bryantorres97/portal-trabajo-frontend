import { expect, test } from "@playwright/test";

/** Fase 6 — contrataciones: control de acceso de páginas y API (sin sesión), CSRF y tarea interna. */

const UUID = "00000000-0000-4000-8000-000000000456";

test.describe("Fase 6 — contrataciones", () => {
  for (const ruta of ["/contrataciones", `/contrataciones/${UUID}`]) {
    test(`${ruta} sin sesión pide iniciar sesión (login ciudadano)`, async ({ request }) => {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const destino = new URL(res.headers()["location"], "http://x");
      expect(destino.pathname).toBe("/api/auth/login");
      expect(destino.searchParams.get("returnTo")).toBe(ruta);
    });
  }

  test("la API de contrataciones exige autenticación", async ({ request }) => {
    expect((await request.get("/api/v1/contracts")).status()).toBe(401);
    expect((await request.get(`/api/v1/contracts/${UUID}`)).status()).toBe(401);
  });

  test("las mutaciones desde otro origen se rechazan (CSRF)", async ({ request }) => {
    const headers = { origin: "http://evil.example" };
    expect((await request.post("/api/v1/contracts", { headers, data: {} })).status()).toBe(403);
    for (const accion of ["accept", "terms", "reject", "cancel", "start", "dispute"]) {
      expect((await request.post(`/api/v1/contracts/${UUID}/${accion}`, { headers, data: {} })).status()).toBe(403);
    }
    expect((await request.delete(`/api/v1/contracts/${UUID}/dispute`, { headers })).status()).toBe(403);
  });

  test("la tarea de plazos no se ejecuta sin el secreto", async ({ request }) => {
    const res = await request.get("/api/internal/contracts", { headers: { authorization: "Bearer incorrecto" } });
    expect([401, 503]).toContain(res.status());
  });
});
