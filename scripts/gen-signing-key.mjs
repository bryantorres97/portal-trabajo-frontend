// Genera la clave ES256 LOCAL con la que Supabase local y el servidor del portal firman/verifican
// los JWT de Realtime (ADR-004). Se guarda en supabase/signing_keys.json (ignorado por git).
// Uso: pnpm db:keys  (no sobrescribe una clave existente; --force para regenerarla)
// También lo usa el CI (.github/workflows/ci.yml) antes de `supabase start`.
//
// Ojo: desde la CLI 2.1xx, `supabase gen signing-key` ya no imprime el JWK: lo agrega él mismo a
// supabase/signing_keys.json, que debe existir (en Linux falla con NotFound si no está). Las
// versiones anteriores lo imprimían. Este script acepta ambos comportamientos y verifica el archivo.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const destino = "supabase/signing_keys.json";
if (existsSync(destino)) {
  if (!process.argv.includes("--force")) {
    console.log(`${destino} ya existe (usa --force para regenerarla).`);
    process.exit(0);
  }
  rmSync(destino);
}
writeFileSync(destino, "[]\n"); // la CLI agrega la clave a este arreglo vacío

const salida = execSync("supabase gen signing-key --algorithm ES256", {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const linea = salida.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
if (linea) writeFileSync(destino, `${JSON.stringify([JSON.parse(linea)], null, 2)}\n`); // CLI antigua

const claves = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")) : [];
const clave = Array.isArray(claves) && claves.length === 1 ? claves[0] : null;
if (!clave || clave.alg !== "ES256" || !clave.d || !clave.kid) {
  throw new Error(`No se pudo crear ${destino}: se esperaba exactamente una clave privada ES256`);
}
console.log(`Clave local creada (${clave.kid}). Reinicia Supabase local: supabase stop && supabase start`);
