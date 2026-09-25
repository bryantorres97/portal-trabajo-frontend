import { expect, test } from "@playwright/test";

test.describe("Fase 2 — rutas públicas y protección", () => {
  test("/terminos carga con encabezado", async ({ page }) => {
    const res = await page.goto("/terminos");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Términos y condiciones" })).toBeVisible();
  });

  test("el pie de página enlaza a los términos", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "Términos y condiciones" }).click();
    await expect(page).toHaveURL(/\/terminos$/);
  });

  for (const ruta of ["/admin/usuarios", "/cuenta/consentimiento"]) {
    test(`${ruta} sin sesión redirige al login`, async ({ request }) => {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toContain("/api/auth/login?returnTo=");
    });
  }
});

test.describe("API /api/v1/me", () => {
  test("sin credenciales → 401 application/problem+json", async ({ request }) => {
    const res = await request.get("/api/v1/me");
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"]).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({ status: 401, title: "No autenticado" });
  });

  test("Bearer inválido → 401", async ({ request }) => {
    const res = await request.get("/api/v1/me", { headers: { authorization: "Bearer token-falso" } });
    expect(res.status()).toBe(401);
  });

  test("PATCH desde otro origen → 403 (CSRF)", async ({ request }) => {
    const res = await request.patch("/api/v1/me", {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: { fullName: "X" },
    });
    expect(res.status()).toBe(403);
  });

  test("DELETE de sesiones sin credenciales → 403/401, nunca 200", async ({ request }) => {
    const res = await request.delete("/api/v1/me/sessions", { headers: { origin: "http://localhost:3210" } });
    expect([401, 403]).toContain(res.status());
  });
});
