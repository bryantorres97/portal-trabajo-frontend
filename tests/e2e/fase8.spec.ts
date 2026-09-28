import { expect, test } from "@playwright/test";

/** Fase 8 — denuncias: control de acceso de páginas y API, CSRF y tarea interna. */

const WORKER_SEED = "00000000-0000-4000-a000-000000000001";
const UUID = "00000000-0000-4000-8000-000000000999";

test.describe("Fase 8 — denuncias y moderación", () => {
  for (const ruta of ["/denuncias", `/denuncias/${UUID}`]) {
    test(`${ruta} sin sesión pide iniciar sesión`, async ({ request }) => {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/api/auth/login");
    });
  }

  test("el perfil público ofrece denunciar el perfil", async ({ page }) => {
    await page.goto(`/trabajadores/${WORKER_SEED}`);
    await page.getByRole("button", { name: "Denunciar este perfil" }).click();
    await expect(page.getByRole("dialog")).toContainText("¿Qué pasó?");
  });

  test("la API de denuncias exige sesión y origen propio", async ({ request }) => {
    expect((await request.get("/api/v1/reports")).status()).toBe(401);
    expect((await request.get(`/api/v1/reports/${UUID}`)).status()).toBe(401);
    const headers = { origin: "http://evil.example" };
    expect((await request.post("/api/v1/reports", { headers, data: {} })).status()).toBe(403);
    expect((await request.post(`/api/v1/reports/${UUID}/evidence`, { headers, data: { note: "x" } })).status()).toBe(
      403,
    );
  });

  test("la bandeja y la evidencia del panel piden el ingreso del personal", async ({ request }) => {
    for (const ruta of ["/admin/denuncias", `/admin/denuncias/${UUID}`, `/admin/denuncias/${UUID}/evidencia/${UUID}`]) {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect([303, 307]).toContain(res.status());
      expect(res.headers()["location"]).toContain("/admin/ingresar");
    }
  });

  test("la tarea de vigencias no se ejecuta sin el secreto", async ({ request }) => {
    const res = await request.get("/api/internal/moderation", { headers: { authorization: "Bearer incorrecto" } });
    expect([401, 503]).toContain(res.status());
  });
});
