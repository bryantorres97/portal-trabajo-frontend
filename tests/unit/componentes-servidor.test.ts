import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Un componente de servidor no puede pasar funciones a uno de cliente (p. ej. `children` como
 * función de ActionForm): React falla al renderizar la página. Ese patrón solo va en archivos
 * con "use client".
 */

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : n.endsWith(".tsx") ? [p] : [];
  });
}

const raiz = path.resolve(import.meta.dirname, "../../src");
const servidor = archivos(raiz).filter((f) => !/^\s*["']use client["']/.test(readFileSync(f, "utf8")));

describe("componentes de servidor", () => {
  it.each(servidor.map((f) => [path.relative(raiz, f), f]))("%s no pasa funciones como children", (_n, archivo) => {
    expect(readFileSync(archivo, "utf8")).not.toMatch(/\{\s*\(\s*state\s*\)\s*=>/);
  });
});
