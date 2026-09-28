import "server-only";

import { timingSafeEqual } from "node:crypto";

import { getCronEnv } from "@/lib/env";
import { problem } from "@/server/http/api";

/**
 * Tareas internas que invoca el programador (Vercel Cron) con `Authorization: Bearer <CRON_SECRET>`.
 * Devuelve la respuesta de error (503 sin secreto, 401 si no coincide) o null si está autorizado.
 */
export function cronRejection(request: Request) {
  let secreto: string;
  try {
    secreto = getCronEnv().CRON_SECRET;
  } catch {
    return problem(503, "No disponible", "Falta configurar CRON_SECRET.");
  }
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return problem(401, "No autenticado");
  }
  return null;
}
