// Valida migraciones nuevas y pruebas pgTAP contra Supabase dev en la NUBE sin guardar nada (ADR-013).
//
//   node scripts/validar-nube.mjs supabase/migrations/<nueva>.sql [supabase/tests/<prueba>.test.sql ...]
//
// Arma una sola consulta: adaptador pgTAP (scripts/tap-shim.sql) + migraciones + pruebas y la ejecuta
// con `supabase db query --linked`. La consulta es UNA transacción que termina siempre en una
// excepción (TAP_OK o TAP_FALLA): la nube queda intacta. Aplicar la migración de verdad sigue siendo
// `supabase db push` (con confirmación).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  console.error("Uso: node scripts/validar-nube.mjs <migración.sql> [prueba.test.sql ...]");
  process.exit(2);
}

const partes = [readFileSync("scripts/tap-shim.sql", "utf8")];
let hayPruebas = false;
for (const archivo of archivos) {
  const sql = readFileSync(archivo, "utf8");
  if (archivo.endsWith(".test.sql")) {
    hayPruebas = true;
    // Las pruebas abren y revierten su propia transacción; aquí ya hay una.
    partes.push("set search_path = tap_shim, public, extensions;");
    partes.push(sql.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*rollback;\s*$/gim, ""));
  } else {
    partes.push(sql);
  }
}
if (!hayPruebas)
  partes.push("do $$ begin raise exception 'TAP_OK migración aplicada sin errores (transacción revertida)'; end $$;");

const dir = mkdtempSync(path.join(tmpdir(), "validar-nube-"));
const archivoSql = path.join(dir, "validacion.sql");
writeFileSync(archivoSql, partes.join("\n\n"));

const r = spawnSync("supabase", ["db", "query", "--linked", "-f", archivoSql], { encoding: "utf8", shell: true });
const salida = `${r.stdout}\n${r.stderr}`.replace(/\\n/g, "\n").replace(/\\"/g, '"');
const inicio = salida.search(/TAP_(OK|FALLA)|ERROR:/);
console.log(inicio >= 0 ? salida.slice(inicio).split('"}')[0] : salida);
process.exit(/TAP_OK/.test(salida) ? 0 : 1);
