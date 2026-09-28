import { describe, expect, it } from "vitest";

import { serializarJsonLd } from "@/components/site/JsonLd";
import { formatearTarifa, hayFiltros, iniciales, parseFiltros, urlBusqueda } from "@/lib/busqueda";

describe("parseFiltros", () => {
  it("interpreta filtros válidos desde la URL", () => {
    expect(
      parseFiltros(
        new URLSearchParams(
          "q=plomero&oficio=plomeria&parroquia=izamba&disponible=1&experiencia=5&calificacion=4&orden=experiencia&pagina=2",
        ),
      ),
    ).toEqual({
      q: "plomero",
      oficio: "plomeria",
      parroquia: "izamba",
      disponible: true,
      experiencia: 5,
      calificacion: 4,
      orden: "experiencia",
      pagina: 2,
    });
  });

  it("descarta valores inválidos o manipulados sin fallar", () => {
    const f = parseFiltros({
      oficio: "DROP TABLE;",
      experiencia: "-1",
      calificacion: "9",
      orden: "x",
      pagina: "abc",
      disponible: "si",
    });
    expect(f).toEqual({ pagina: 1 });
    expect(hayFiltros(f)).toBe(false);
  });

  it("toma el primer valor si un parámetro se repite", () => {
    expect(parseFiltros({ q: ["uno", "dos"] }).q).toBe("uno");
  });
});

describe("urlBusqueda", () => {
  it("omite vacíos y la página 1, conserva el resto", () => {
    expect(urlBusqueda({ pagina: 1 })).toBe("/buscar");
    expect(urlBusqueda({ q: "fuga de agua", oficio: "plomeria", pagina: 1 }, { pagina: 3 })).toBe(
      "/buscar?q=fuga+de+agua&oficio=plomeria&pagina=3",
    );
    expect(urlBusqueda({ disponible: true, orden: "calificacion" })).toBe("/buscar?disponible=1&orden=calificacion");
  });

  it("ida y vuelta: parseFiltros(urlBusqueda(f)) === f", () => {
    const f = parseFiltros({ q: "pintor", categoria: "construccion", experiencia: "10", pagina: "2" });
    const url = new URL(urlBusqueda(f), "http://x");
    expect(parseFiltros(url.searchParams)).toEqual(f);
  });
});

describe("formatos", () => {
  it("formatea tarifas referenciales", () => {
    expect(formatearTarifa(25, 35, "JORNAL")).toBe("$25 – $35 por día");
    expect(formatearTarifa(15, 15, "SERVICIO")).toBe("$15 por servicio");
    expect(formatearTarifa(null, 40, "HORA")).toBe("$40 por hora");
    expect(formatearTarifa(12.5, null, "OBRA")).toBe("$12.50 por obra");
    expect(formatearTarifa(null, null, "JORNAL")).toBeNull();
  });

  it("iniciales para el avatar", () => {
    expect(iniciales("Ana Lucía V.")).toBe("AL");
    expect(iniciales("Édison C.")).toBe("ÉC");
  });
});

describe("JSON-LD seguro", () => {
  it("escapa caracteres que podrían cerrar el <script>", () => {
    const s = serializarJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(s).not.toContain(">");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>");
  });
});
