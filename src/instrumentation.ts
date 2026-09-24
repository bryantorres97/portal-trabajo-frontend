import type { Instrumentation } from "next";

import { logger } from "@/lib/logger";

export function register() {
  logger.info("app.start", { appEnv: process.env.APP_ENV ?? "local", runtime: process.env.NEXT_RUNTIME });
}

/**
 * Registro estructurado de errores del servidor, con el request-id asignado en `proxy.ts`.
 * Fase 10: enviar además a un proveedor de observabilidad (Sentry/OpenTelemetry).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const headers = request.headers as Record<string, string | string[] | undefined>;
  logger.error("request.error", {
    message: err instanceof Error ? err.message : String(err),
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined,
    method: request.method,
    path: request.path,
    requestId: headers["x-request-id"],
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
