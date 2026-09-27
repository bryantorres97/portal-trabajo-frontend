import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { bajaDispositivoSchema } from "@/server/domain/notifications/schemas";
import { buildOpenApiDocument, entrada, OPERACIONES } from "@/server/http/openapi/document";

/** H7 (Fase 11): la OpenAPI cubre todas las rutas de /api/v1 y es coherente. */

const RAIZ = path.resolve(import.meta.dirname, "../../src/app/api/v1");

function rutas(dir = RAIZ): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const completo = path.join(dir, nombre);
    if (statSync(completo).isDirectory()) return rutas(completo);
    return nombre === "route.ts" ? [completo] : [];
  });
}

/** `src/app/api/v1/contracts/[id]/[action]/route.ts` → `/contracts/{id}/{action}` + métodos exportados. */
function handlers() {
  return rutas().map((archivo) => {
    const relativa = path.relative(RAIZ, path.dirname(archivo)).split(path.sep).join("/");
    const ruta = `/${relativa}`.replace(/\[([^\]]+)\]/g, "{$1}");
    const metodos = [
      ...readFileSync(archivo, "utf8").matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g),
    ].map((m) => m[1].toLowerCase());
    return { ruta, metodos };
  });
}

describe("OpenAPI de /api/v1", () => {
  const doc = buildOpenApiDocument();
  const documentadas = OPERACIONES.map((o) => `${o.method} ${o.path}`);

  it("documenta cada método de cada Route Handler", () => {
    const encontrados = handlers();
    expect(encontrados.length).toBeGreaterThan(35);
    const faltan: string[] = [];
    for (const { ruta, metodos } of encontrados) {
      for (const metodo of metodos) {
        // Las acciones de la contratación comparten un handler dinámico: basta con una documentada por método.
        const patron = ruta.endsWith("/{action}")
          ? new RegExp(`^${metodo} ${ruta.replace("{id}", "\\{id\\}").replace("/{action}", "/[a-z]+")}$`)
          : null;
        const ok = patron ? documentadas.some((d) => patron.test(d)) : documentadas.includes(`${metodo} ${ruta}`);
        if (!ok) faltan.push(`${metodo.toUpperCase()} ${ruta}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it("no documenta rutas inexistentes", () => {
    const existentes = handlers();
    const sobran = OPERACIONES.filter(
      (o) =>
        !existentes.some(
          (h) =>
            h.metodos.includes(o.method) &&
            (h.ruta === o.path ||
              (h.ruta.endsWith("/{action}") && o.path.startsWith(h.ruta.replace("/{action}", "/")))),
        ),
    ).map((o) => `${o.method} ${o.path}`);
    expect(sobran).toEqual([]);
  });

  it("no repite operaciones y cada una tiene respuesta de éxito y de error", () => {
    expect(new Set(documentadas).size).toBe(documentadas.length);
    for (const [ruta, metodos] of Object.entries(doc.paths)) {
      for (const [metodo, op] of Object.entries(metodos as Record<string, { responses: Record<string, unknown> }>)) {
        const codigos = Object.keys(op.responses).map(Number);
        expect(
          codigos.some((c) => c < 300),
          `${metodo} ${ruta}`,
        ).toBe(true);
        expect(codigos).toContain(500);
      }
    }
  });

  it("todas las referencias apuntan a componentes existentes", () => {
    const refs = [...JSON.stringify(doc).matchAll(/"#\/components\/schemas\/([A-Za-z]+)"/g)].map((m) => m[1]);
    const componentes = Object.keys(doc.components.schemas);
    expect(refs.filter((r) => !componentes.includes(r))).toEqual([]);
  });

  it("los cuerpos de entrada salen de los esquemas del servidor; los campos con valor por defecto son opcionales", () => {
    expect(entrada(bajaDispositivoSchema)).toMatchObject({
      type: "object",
      properties: { token: { type: "string", minLength: 20 }, keepAnonymous: { type: "boolean" } },
      required: ["token"],
    });
    expect(entrada(z.object({ a: z.string().optional() }))).not.toHaveProperty("required");
  });

  it("las rutas públicas no exigen autenticación y /me/bootstrap solo acepta Bearer", () => {
    const paths = doc.paths as Record<string, Record<string, { security?: unknown[] }>>;
    expect(paths["/workers"].get.security).toEqual([]);
    expect(paths["/me/bootstrap"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(paths["/me"].get.security).toBeUndefined();
    expect(doc.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
  });
});
