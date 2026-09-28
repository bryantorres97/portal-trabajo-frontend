/**
 * CSV para Excel en español (Ecuador): separador «;», BOM UTF-8 y protección contra inyección de
 * fórmulas (celdas que empiezan con = + - @ o tabulación se prefijan con un apóstrofo).
 */

export type Celda = string | number | boolean | null | undefined;

export function celdaCsv(valor: Celda): string {
  if (valor == null) return "";
  let texto = typeof valor === "boolean" ? (valor ? "Sí" : "No") : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(encabezados: readonly string[], filas: readonly (readonly Celda[])[]): string {
  const lineas = [encabezados.map(celdaCsv).join(";"), ...filas.map((f) => f.map(celdaCsv).join(";"))];
  return `﻿${lineas.join("\r\n")}\r\n`;
}
