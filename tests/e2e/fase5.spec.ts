import { expect, test } from "@playwright/test";

/** Fase 5 — chat: control de acceso de páginas y API (sin sesión) y botón de contacto. */

const WORKER_SEED = "00000000-0000-4000-a000-000000000001";
const UUID = "00000000-0000-4000-8000-000000000123";

test.describe("Fase 5 — chat", () => {
  for (const ruta of ["/mensajes", `/mensajes/${UUID}`, `/mensajes/nuevo?trabajador=${WORKER_SEED}`]) {
    test(`${ruta} sin sesión pide iniciar sesión (login ciudadano)`, async ({ request }) => {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const destino = new URL(res.headers()["location"], "http://x");
      expect(destino.pathname).toBe("/api/auth/login");
      expect(destino.searchParams.get("returnTo")).toBe(ruta);
    });
  }

  test("el perfil público lleva al chat (nunca muestra el teléfono)", async ({ page }) => {
    await page.goto(`/trabajadores/${WORKER_SEED}`);
    const boton = page.getByRole("link", { name: "Escribir por el chat" });
    await expect(boton).toHaveAttribute("href", `/mensajes/nuevo?trabajador=${WORKER_SEED}`);
    await expect(page.locator("body")).not.toContainText("0990000001");
  });

  test("la API del chat exige autenticación", async ({ request }) => {
    expect((await request.get("/api/v1/conversations")).status()).toBe(401);
    expect((await request.get(`/api/v1/conversations/${UUID}/messages`)).status()).toBe(401);
    expect((await request.get("/api/v1/notifications")).status()).toBe(401);
  });

  test("las mutaciones desde otro origen se rechazan (CSRF)", async ({ request }) => {
    const headers = { origin: "http://evil.example" };
    expect((await request.post("/api/v1/realtime/token", { headers })).status()).toBe(403);
    expect(
      (await request.post(`/api/v1/conversations/${UUID}/messages`, { headers, data: { body: "hola" } })).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/v1/conversations", { headers, data: { workerId: WORKER_SEED, body: "hola" } })
      ).status(),
    ).toBe(403);
  });

  test("el despachador interno no se ejecuta sin el secreto", async ({ request }) => {
    const res = await request.get("/api/internal/outbox", { headers: { authorization: "Bearer incorrecto" } });
    expect([401, 503]).toContain(res.status());
  });
});
