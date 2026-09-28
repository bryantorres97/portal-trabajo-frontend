import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { cronRejection } from "@/server/http/cron";
import { runModerationMaintenance } from "@/server/reports/admin";

/**
 * GET /api/internal/moderation — levanta las suspensiones vencidas. Respaldo de la tarea pg_cron
 * `llankana-moderacion-vigencias`; lo invoca el programador con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const rechazo = cronRejection(request);
  if (rechazo) return rechazo;
  try {
    return NextResponse.json(
      { processed: await runModerationMaintenance() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
