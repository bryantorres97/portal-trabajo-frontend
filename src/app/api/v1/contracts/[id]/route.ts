import { NextResponse } from "next/server";

import { getContract } from "@/server/contracts/contracts";
import { toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";

/** GET /api/v1/contracts/{id} — detalle con todas las versiones, historial y acciones disponibles. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/contracts/[id]">) {
  try {
    const user = await apiChatUser();
    const { id } = await ctx.params;
    return NextResponse.json(await getContract(user, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
