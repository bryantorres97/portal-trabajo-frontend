import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { AuthError } from "@/server/auth/authorize";
import { DomainError } from "@/server/errors";

/**
 * Utilidades para Route Handlers de `/api/v1`: errores RFC 9457 (`application/problem+json`),
 * validación de entrada y protección de origen para mutaciones autenticadas por cookie.
 */

export function problem(status: number, title: string, detail?: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { type: "about:blank", title, status, ...(detail ? { detail } : {}), ...extra },
    { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } },
  );
}

const titulos: Record<number, string> = {
  400: "Solicitud inválida",
  401: "No autenticado",
  403: "Acceso denegado",
  404: "No encontrado",
  409: "Conflicto",
  415: "Tipo de contenido no soportado",
  422: "Datos inválidos",
};

export function toProblem(error: unknown) {
  if (error instanceof AuthError || error instanceof DomainError) {
    return problem(error.status, titulos[error.status] ?? "Error", error.message);
  }
  if (error instanceof z.ZodError) {
    return problem(422, titulos[422], "Revisa los campos enviados.", {
      errors: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  logger.error("api.unhandled_error", { error });
  return problem(500, "Error interno", "Ocurrió un error inesperado.");
}

/**
 * Las mutaciones autenticadas con cookie deben venir del propio sitio (CSRF).
 * Las que usan `Authorization: Bearer` (app móvil) no dependen de cookies y quedan exentas.
 */
export function assertSameOrigin(request: Request) {
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return;
  const origin = request.headers.get("origin");
  const esperado = new URL(request.url).origin;
  if (!origin || origin !== esperado) throw new AuthError(403, "Origen no permitido");
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new DomainError(400, "Se esperaba un cuerpo JSON (Content-Type: application/json)");
  }
  const body: unknown = await request.json().catch(() => {
    throw new DomainError(400, "JSON mal formado");
  });
  return schema.parse(body);
}
