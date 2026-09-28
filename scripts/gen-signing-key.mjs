// Genera la clave ES256 LOCAL con la que Supabase local y el servidor del portal firman/verifican
// los JWT de Realtime (ADR-004). Se guarda en supabase/signing_keys.json (ignorado por git).
// Uso: pnpm db:keys  (no sobrescribe una clave existente; --force para regenerarla)
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const destino = "supabase/signing_keys.json";
if (existsSync(destino) && !process.argv.includes("--force")) {
  console.log(`${destino} ya existe (usa --force para regenerarla).`);
  process.exit(0);
}

const salida = execFileSync("supabase", ["gen", "signing-key", "--algorithm", "ES256"], {
  encoding: "utf8",
  shell: true,
});
const linea = salida.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
if (!linea) throw new Error("La CLI de Supabase no devolvió una clave");
const clave = JSON.parse(linea);
writeFileSync(destino, `${JSON.stringify([clave], null, 2)}\n`);
console.log(`Clave local creada (${clave.kid}). Reinicia Supabase local: supabase stop && supabase start`);
