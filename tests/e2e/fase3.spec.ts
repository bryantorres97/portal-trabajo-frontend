import { expect, test } from "@playwright/test";

/** Requiere el seed de desarrollo (pnpm test:e2e:local). */
test.describe("Fase 3 — búsqueda y perfiles", () => {
  test("desde el inicio, buscar lleva a /buscar con resultados", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder(/albañilería/).fill("plomero");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/\/buscar\?q=plomero/);
    await expect(page.getByRole("status")).toContainText(/trabajador/);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  });

  test("la URL de búsqueda es compartible y reproduce los filtros", async ({ page }) => {
    await page.goto("/buscar?oficio=cerrajeria&disponible=1");
    const nombres = await page.getByRole("article").getByRole("heading").allTextContents();
    expect(nombres.length).toBeGreaterThan(0);
    await page.reload();
    expect(await page.getByRole("article").getByRole("heading").allTextContents()).toEqual(nombres);
  });

  test("sin resultados muestra ayuda y permite quitar filtros", async ({ page }) => {
    await page.goto("/buscar?q=zzzzzzzz");
    await expect(page.getByText(/Prueba con otra palabra/)).toBeVisible();
  });

  test("perfil público: sin teléfono, con JSON-LD y enlace a sus oficios", async ({ page }) => {
    await page.goto("/buscar?oficio=electricidad");
    await page.getByRole("article").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/trabajadores\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Habilitado por el GAD Municipalidad de Ambato")).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/0990000\d{3}/); // teléfonos del seed nunca se muestran (RN-19)
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(jsonLd ?? "{}")["@type"]).toBe("Person");
  });

  test("trabajador no habilitado → 404", async ({ request }) => {
    // Trabajador del seed en CAPACITACION_EN_PROCESO (Jorge Llerena, índice 9).
    const res = await request.get("/trabajadores/00000000-0000-4000-a000-000000000009");
    expect(res.status()).toBe(404);
  });

  test("API pública de búsqueda y catálogo", async ({ request }) => {
    const r = await request.get("/api/v1/workers?q=plomeria");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.total).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/"phone"|"email"|"address"/);
    const c = await request.get("/api/v1/categories");
    expect((await c.json()).categories.length).toBeGreaterThan(0);
    expect((await request.get("/api/v1/workers/no-es-uuid")).status()).toBe(404);
  });

  test("sitemap incluye oficios y perfiles", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/oficios/plomeria");
    expect(xml).toMatch(/\/trabajadores\/[0-9a-f-]{36}/);
  });

  test("/admin/catalogo sin sesión redirige al login", async ({ request }) => {
    const res = await request.get("/admin/catalogo", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });
});
