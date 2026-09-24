// Ejecuta los tests de integración usando las credenciales de `supabase status` (Supabase local).
import { execFileSync, spawnSync } from "node:child_process";

const salida = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", shell: true });
const status = JSON.parse(salida.slice(salida.indexOf("{"), salida.lastIndexOf("}") + 1));

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
};

const r = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.integration.config.mts"], {
  stdio: "inherit",
  env,
  shell: true,
});
process.exit(r.status ?? 1);
