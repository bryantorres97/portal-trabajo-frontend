import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { cronRejection } from "@/server/http/cron";
import { dispatchOutbox } from "@/server/notifications/notifications";

/**
 * GET /api/internal/outbox — despacha las notificaciones push pendientes. Lo invoca el
 * programador de tareas (Vercel Cron) con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const rechazo = cronRejection(request);
  if (rechazo) return rechazo;
  try {
    return NextResponse.json(await dispatchOutbox(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
