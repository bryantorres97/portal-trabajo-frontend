import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { cronRejection } from "@/server/http/cron";
import { dispatchPending } from "@/server/notifications/dispatcher";

export const maxDuration = 60;

/**
 * GET /api/internal/outbox — despacha los push pendientes: la cola de eventos (chat,
 * contrataciones) y los avisos del GAD, incluidos los programados que vencieron y los reintentos.
 * Lo invoca el programador de tareas (Vercel Cron, `vercel.json`) con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const rechazo = cronRejection(request);
  if (rechazo) return rechazo;
  try {
    return NextResponse.json(await dispatchPending({ budgetMs: 50_000 }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
