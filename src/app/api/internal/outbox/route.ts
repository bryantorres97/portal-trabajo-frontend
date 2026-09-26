import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getCronEnv } from "@/lib/env";
import { problem, toProblem } from "@/server/http/api";
import { dispatchOutbox } from "@/server/notifications/notifications";

/**
 * GET /api/internal/outbox — despacha las notificaciones push pendientes. Lo invoca el
 * programador de tareas (Vercel Cron) con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  let secreto: string;
  try {
    secreto = getCronEnv().CRON_SECRET;
  } catch {
    return problem(503, "No disponible", "Falta configurar CRON_SECRET.");
  }
  try {
    const esperado = Buffer.from(`Bearer ${secreto}`);
    const recibido = Buffer.from(request.headers.get("authorization") ?? "");
    if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
      return problem(401, "No autenticado");
    }
    return NextResponse.json(await dispatchOutbox(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
