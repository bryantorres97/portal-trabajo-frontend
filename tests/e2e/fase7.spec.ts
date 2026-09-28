import { expect, test } from "@playwright/test";

/** Fase 7 — calificaciones: reseñas públicas en el perfil, API pública y control de acceso. */

const WORKER_SEED = "00000000-0000-4000-a000-000000000001";
const UUID = "00000000-0000-4000-8000-000000000789";

test.describe("Fase 7 — calificaciones", () => {
  test("el perfil público muestra la sección de reseñas", async ({ page }) => {
    await page.goto(`/trabajadores/${WORKER_SEED}`);
    await expect(page.getByRole("heading", { name: /Reseñas de clientes/ })).toBeVisible();
  });

  test("la API pública de reseñas responde sin sesión y nunca expone calificaciones a clientes", async ({
    request,
  }) => {
    const res = await request.get(`/api/v1/workers/${WORKER_SEED}/reviews`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/TRABAJADOR_A_CLIENTE/);
  });

  test("calificar, denunciar y la reputación del cliente exigen sesión", async ({ request }) => {
    expect((await request.get(`/api/v1/contracts/${UUID}/review`)).status()).toBe(401);
    expect((await request.get(`/api/v1/conversations/${UUID}/client-reputation`)).status()).toBe(401);
    const headers = { origin: "http://evil.example" };
    expect((await request.post(`/api/v1/contracts/${UUID}/review`, { headers, data: { rating: 5 } })).status()).toBe(
      403,
    );
    expect((await request.post(`/api/v1/reviews/${UUID}/report`, { headers, data: {} })).status()).toBe(403);
  });

  test("la moderación del panel pide el ingreso del personal", async ({ request }) => {
    const res = await request.get("/admin/resenas", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/admin/ingresar");
  });
});
