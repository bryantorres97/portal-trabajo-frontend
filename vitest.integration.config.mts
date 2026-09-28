import path from "node:path";

import { defineConfig } from "vitest/config";

/** Tests de integración contra Supabase local. Requiere `pnpm db:start`; ejecutar con `pnpm test:integration`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      SESSION_SECRET: "clave-de-pruebas-de-integracion-no-usar-en-produccion",
      // Los avisos programados están apagados en Vercel Hobby (ADR-015, B6); las pruebas los cubren igual.
      PUSH_SCHEDULER_ENABLED: "true",
    },
  },
});
