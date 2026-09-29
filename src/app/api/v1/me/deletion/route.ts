import { NextResponse } from "next/server";

import { apiUser } from "@/server/http/api-auth";
import { toProblem } from "@/server/http/api";
import { getAccountDeletionCheck } from "@/server/users/account-deletion";

/**
 * GET /api/v1/me/deletion — qué pasaría al eliminar la cuenta: contrataciones en marcha que lo
 * impiden y propuestas que se cancelarían (ADR-018).
 */
export async function GET() {
  try {
    const user = await apiUser();
    return NextResponse.json(await getAccountDeletionCheck(user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
