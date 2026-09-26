// Ejecuta los tests de integración usando las credenciales de `supabase status` (Supabase local).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const salida = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", shell: true });
const status = JSON.parse(salida.slice(salida.indexOf("{"), salida.lastIndexOf("}") + 1));

// Clave ES256 local con la que el servidor firma los JWT de Realtime (ADR-004, docs/setup/realtime.md).
const realtimeKey = existsSync("supabase/signing_keys.json")
  ? JSON.stringify(JSON.parse(readFileSync("supabase/signing_keys.json", "utf8"))[0])
  : undefined;

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  ...(realtimeKey ? { REALTIME_JWT_PRIVATE_KEY: realtimeKey } : {}),
};

const r = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.integration.config.mts"], {
  stdio: "inherit",
  env,
  shell: true,
});
process.exit(r.status ?? 1);
