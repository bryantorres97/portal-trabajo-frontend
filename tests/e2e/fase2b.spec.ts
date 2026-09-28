import { expect, test } from "@playwright/test";

/** Fase 2B — ingreso del personal del GAD con Microsoft Entra ID (ADR-012). */

test.describe("Fase 2B — ingreso del personal", () => {
  for (const ruta of ["/admin", "/admin/usuarios", "/admin/catalogo"]) {
    test(`${ruta} sin sesión redirige al ingreso del personal (no al login ciudadano)`, async ({ request }) => {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const destino = new URL(res.headers()["location"], "http://x");
      expect(destino.pathname).toBe("/admin/ingresar");
      expect(destino.searchParams.get("returnTo")).toBe(ruta);
    });
  }

  test("/admin/ingresar muestra la pantalla de ingreso institucional", async ({ page }) => {
    const res = await page.goto("/admin/ingresar");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Ingreso del personal" })).toBeVisible();
  });

  test("/admin/ingresar explica el rechazo de cuentas externas", async ({ page }) => {
    await page.goto("/admin/ingresar?error=cuenta_externa");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("cuentas institucionales del GAD");
  });

  test("el login del personal va a Microsoft (o avisa que no está configurado)", async ({ request }) => {
    const res = await request.get("/api/auth/staff/login?returnTo=/admin/usuarios", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const destino = new URL(res.headers()["location"], "http://x");
    if (destino.hostname === "login.microsoftonline.com") {
      expect(destino.pathname).toMatch(/^\/[0-9a-f-]{36}\/oauth2\/v2\.0\/authorize$/);
      expect(destino.searchParams.get("code_challenge_method")).toBe("S256");
      expect(destino.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/staff\/callback$/);
      expect(res.headers()["set-cookie"]).toContain("HttpOnly");
    } else {
      expect(destino.pathname + destino.search).toBe("/admin/ingresar?error=no_configurado");
    }
  });

  test("el callback del personal sin state válido no abre sesión", async ({ request }) => {
    const res = await request.get("/api/auth/staff/callback?code=x&state=y", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/admin\/ingresar\?error=(login_invalido|no_configurado)$/);
    expect(res.headers()["set-cookie"] ?? "").not.toMatch(/acolita_session=[^;]/);
  });

  test("la CSP permite terminar el logout en Microsoft", async ({ request }) => {
    const res = await request.get("/admin/ingresar");
    expect(res.headers()["content-security-policy"]).toContain("https://login.microsoftonline.com");
  });
});
