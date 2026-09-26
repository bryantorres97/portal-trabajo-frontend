// Compila y ejecuta los E2E contra Supabase LOCAL (datos del seed de desarrollo).
// Uso: pnpm test:e2e:local            → build + playwright
//      pnpm test:e2e:local --serve    → build + next start (revisión manual en http://localhost:3210)
//      pnpm test:e2e:local --no-build → reutiliza el build existente
// Las variables de proceso tienen prioridad sobre .env.local, así que el build apunta a la base local.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const PORT = process.env.E2E_PORT ?? "3210";

const salida = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", shell: true });
const status = JSON.parse(salida.slice(salida.indexOf("{"), salida.lastIndexOf("}") + 1));

// Clave ES256 local con la que el servidor firma los JWT de Realtime (ADR-004, docs/setup/realtime.md).
const realtimeKey = existsSync("supabase/signing_keys.json")
  ? JSON.stringify(JSON.parse(readFileSync("supabase/signing_keys.json", "utf8"))[0])
  : undefined;

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  ...(realtimeKey ? { REALTIME_JWT_PRIVATE_KEY: realtimeKey } : {}),
  NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
  E2E_PORT: PORT,
};

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", env, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!args.has("--no-build")) run("pnpm", ["build"]);
if (args.has("--serve")) run("pnpm", ["start", "--port", PORT]);
else run("pnpm", ["exec", "playwright", "test"]);
