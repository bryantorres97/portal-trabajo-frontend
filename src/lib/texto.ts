/** Rango Unicode de diacríticos combinantes (tildes, diéresis) tras normalizar a NFD. */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/** Minúsculas y sin tildes, para comparaciones de búsqueda simples. */
export function normalizarTexto(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

/** Cuenta palabras separadas por espacios en blanco (regla RN-07: reseñas ≤ 200 palabras). */
export function contarPalabras(texto: string): number {
  const limpio = texto.trim();
  return limpio === "" ? 0 : limpio.split(/\s+/u).length;
}

export const MAX_PALABRAS_RESENA = 200;
