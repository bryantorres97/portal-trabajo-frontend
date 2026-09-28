import { NextResponse } from "next/server";

import { DomainError } from "@/server/errors";
import { toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { getClientReputation } from "@/server/reviews/reviews";

/**
 * GET /api/v1/conversations/{id}/client-reputation — calificaciones que recibió el cliente de la
 * conversación. Solo para su trabajador con rol activo (RN-20); a cualquier otro, 404.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/conversations/[id]/client-reputation">) {
  try {
    const user = await apiChatUser();
    const { id } = await ctx.params;
    const reputacion = await getClientReputation(user, id);
    if (!reputacion) throw new DomainError(404, "Conversación no encontrada");
    return NextResponse.json(reputacion, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
