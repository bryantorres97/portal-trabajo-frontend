import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { getMyReport } from "@/server/reports/reports";

/** GET /api/v1/reports/{id} — seguimiento de una denuncia propia (404 para cualquier otra persona). */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/reports/[id]">) {
  try {
    const user = await apiChatUser();
    const { id } = await ctx.params;
    return NextResponse.json(await getMyReport(user, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
