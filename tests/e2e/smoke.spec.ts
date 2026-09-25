import { expect, test } from "@playwright/test";

test.describe("portal público", () => {
  test("inicio: buscador de oficios filtra resultados", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Acolita\.App/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("necesitas");
    await expect(page.locator("html")).toHaveAttribute("lang", "es-EC");
    await page.waitForLoadState("networkidle"); // el filtro en vivo requiere la hidratación de React

    await page.getByPlaceholder(/albañilería/).fill("plome");
    await expect(page.getByRole("heading", { name: /Oficios que coinciden \(1\)/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Plomería y gasfitería/ })).toBeVisible();

    await page.getByPlaceholder(/albañilería/).fill("zzzz");
    await expect(page.getByText(/Ningún oficio coincide/)).toBeVisible();
  });

  test("oficios: listado y detalle", async ({ page }) => {
    await page.goto("/oficios");
    await page
      .getByRole("link", { name: /^Electricidad/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/oficios\/electricidad$/);
    await expect(page.getByRole("heading", { level: 1, name: "Electricidad" })).toBeVisible();
  });

  for (const ruta of ["/como-funciona", "/contratantes", "/trabajadores", "/contacto", "/privacidad"]) {
    test(`página institucional ${ruta} carga`, async ({ page }) => {
      const res = await page.goto(ruta);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("404 en español", async ({ page }) => {
    const res = await page.goto("/no-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Página no encontrada")).toBeVisible();
  });

  test("headers de seguridad presentes", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
    expect(h["x-request-id"]).toBeTruthy();
  });
});

test.describe("rutas privadas", () => {
  test("/admin sin sesión redirige al flujo de login", async ({ request }) => {
    const res = await request.get("/admin", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/api/auth/login?returnTo=%2Fadmin");
  });

  test("/cuenta sin sesión muestra la pantalla de ingreso", async ({ page }) => {
    await page.goto("/cuenta");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ingresa");
  });

  test("logout rechaza orígenes externos (CSRF)", async ({ request }) => {
    const res = await request.post("/api/auth/logout", {
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
  });
});
