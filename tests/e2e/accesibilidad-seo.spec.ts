import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accesibilidad (WCAG 2.2 A/AA con axe-core) y SEO básico en las páginas públicas clave.
 * Criterio de la Fase 3: sin violaciones graves ni críticas.
 */
const PAGINAS = ["/", "/oficios", "/oficios/plomeria", "/buscar", "/buscar?q=plomero", "/trabajadores", "/terminos"];

for (const ruta of PAGINAS) {
  test(`a11y y SEO: ${ruta}`, async ({ page }) => {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const graves = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(graves.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);

    await expect(page).toHaveTitle(/.{10,}/);
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toMatch(/.{50,}/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es-EC");
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("a11y: perfil de trabajador", async ({ page }) => {
  await page.goto("/buscar?oficio=electricidad");
  await page.getByRole("article").first().getByRole("link").first().click();
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
