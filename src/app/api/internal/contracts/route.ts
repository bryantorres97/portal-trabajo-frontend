import { NextResponse } from "next/server";

import { runContractMaintenance } from "@/server/contracts/contracts";
import { toProblem } from "@/server/http/api";
import { cronRejection } from "@/server/http/cron";

/**
 * GET /api/internal/contracts — aplica los plazos vencidos (expiración de propuestas y confirmación
 * automática). Respaldo de la tarea pg_cron: los plazos se aplican igual al consultar.
 */
export async function GET(request: Request) {
  const rechazo = cronRejection(request);
  if (rechazo) return rechazo;
  try {
    return NextResponse.json(
      { processed: await runContractMaintenance() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
