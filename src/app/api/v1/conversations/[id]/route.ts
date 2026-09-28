import { NextResponse } from "next/server";

import { getConversation } from "@/server/chat/chat";
import { toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";

/** GET /api/v1/conversations/{id} — resumen de una conversación propia (404 si no participa). */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/conversations/[id]">) {
  try {
    const user = await apiChatUser();
    const { id } = await ctx.params;
    return NextResponse.json(await getConversation(user, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
