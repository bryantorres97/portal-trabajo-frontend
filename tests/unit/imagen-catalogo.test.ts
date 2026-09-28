import { describe, expect, it } from "vitest";

import { catalogImageUrl, isCatalogObject, serviceImagePath } from "@/lib/imagen-catalogo";

const SUPABASE = "https://abc.supabase.co/";

describe("imágenes del catálogo", () => {
  it("arma la ruta del bucket con un UUID", () => {
    expect(serviceImagePath("11111111-2222-4333-8444-555555555555", "webp")).toBe(
      "services/11111111-2222-4333-8444-555555555555.webp",
    );
  });

  it("distingue objetos del bucket de las fotos del repositorio", () => {
    expect(isCatalogObject("services/x.jpg")).toBe(true);
    expect(isCatalogObject("/images/oficios/plomeria.jpg")).toBe(false);
    expect(isCatalogObject(null)).toBe(false);
  });

  it("devuelve la URL pública del bucket o la ruta del sitio tal cual", () => {
    expect(catalogImageUrl("services/x.jpg", SUPABASE)).toBe(
      "https://abc.supabase.co/storage/v1/object/public/catalog-images/services/x.jpg",
    );
    expect(catalogImageUrl("/images/oficios/plomeria.jpg", SUPABASE)).toBe("/images/oficios/plomeria.jpg");
    expect(catalogImageUrl(null, SUPABASE)).toBeNull();
  });
});
