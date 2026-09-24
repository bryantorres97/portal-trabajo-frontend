import { describe, expect, it } from "vitest";

import { MAX_PALABRAS_RESENA, contarPalabras, normalizarTexto } from "@/lib/texto";

describe("normalizarTexto", () => {
  it("quita tildes y pasa a minúsculas", () => {
    expect(normalizarTexto("Albañilería y GASFITERÍA")).toBe("albanileria y gasfiteria");
  });
});

describe("contarPalabras (RN-07)", () => {
  it("cuenta 0 en textos vacíos o con solo espacios", () => {
    expect(contarPalabras("")).toBe(0);
    expect(contarPalabras("   \n\t ")).toBe(0);
  });

  it("ignora espacios múltiples y saltos de línea", () => {
    expect(contarPalabras("  muy   buen\ntrabajo \t realizado ")).toBe(4);
  });

  it("detecta el límite de 200 palabras", () => {
    const limite = Array.from({ length: MAX_PALABRAS_RESENA }, () => "palabra").join(" ");
    expect(contarPalabras(limite)).toBe(200);
    expect(contarPalabras(`${limite} extra`)).toBeGreaterThan(MAX_PALABRAS_RESENA);
  });
});
