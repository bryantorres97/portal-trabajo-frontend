import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Criterio de la Fase 5: ningún endpoint administrativo expone mensajes sin denuncia (RN-09).
 * Hasta la Fase 8 (acceso con denuncia y justificación), el panel del GAD no usa el módulo de chat
 * ni consulta las tablas del chat.
 */

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const raiz = path.resolve(import.meta.dirname, "../../src");
const admin = archivos(path.join(raiz, "app", "(privado)", "admin"));

describe("el panel del GAD no accede al chat (RN-09)", () => {
  it.each(admin.map((f) => [path.relative(raiz, f), f]))("%s", (_nombre, archivo) => {
    const codigo = readFileSync(archivo, "utf8");
    expect(codigo).not.toMatch(/@\/server\/chat|fn_list_messages|from\("messages"\)|from\("conversations"\)/);
  });

  it("solo el módulo de chat y el despachador leen mensajes o conversaciones", () => {
    const lectores = archivos(raiz).filter((f) =>
      /fn_list_messages|fn_list_conversations|from\("messages"\)|from\("conversations"\)/.test(readFileSync(f, "utf8")),
    );
    expect(lectores.map((f) => path.relative(raiz, f).replaceAll("\\", "/"))).toEqual(["server/chat/chat.ts"]);
  });
});
