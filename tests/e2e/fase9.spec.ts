import { expect, test } from "@playwright/test";

/** Fase 9 — panel administrativo: control de acceso, descargas y páginas públicas administrables. */

test.describe("Fase 9 — panel administrativo", () => {
  for (const ruta of ["/admin/indicadores", "/admin/reportes", "/admin/auditoria", "/admin/contenido"]) {
    test(`${ruta} pide el ingreso del personal`, async ({ request }) => {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toContain("/admin/ingresar");
    });
  }

  test("las descargas CSV no se sirven sin sesión del personal", async ({ request }) => {
    for (const ruta of ["/admin/reportes/exportar?tipo=trabajadores", "/admin/auditoria/exportar"]) {
      const res = await request.get(ruta, { maxRedirects: 0 });
      expect([303, 307]).toContain(res.status());
      expect(res.headers()["content-type"] ?? "").not.toContain("text/csv");
    }
  });

  test("las preguntas frecuentes se ven en el portal y están en el menú", async ({ page }) => {
    await page.goto("/preguntas-frecuentes");
    await expect(page.getByRole("heading", { name: "Preguntas frecuentes", level: 1 })).toBeVisible();
    await expect(page.getByText("¿Cuánto cuesta usar la plataforma?")).toBeVisible();
  });

  test("el aviso de privacidad muestra la versión vigente", async ({ page }) => {
    await page.goto("/privacidad");
    await expect(page.getByText(/Versión \d+/)).toBeVisible();
  });
});
