import { NextResponse } from "next/server";

import { setConversationBlock } from "@/server/chat/chat";
import { assertSameOrigin, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";

type Ctx = RouteContext<"/api/v1/conversations/[id]/block">;

/** POST /api/v1/conversations/{id}/block — bloquea: ninguna de las partes puede enviar mensajes. */
export async function POST(request: Request, ctx: Ctx) {
  return cambiar(request, ctx, true);
}

/** DELETE /api/v1/conversations/{id}/block — levanta el bloqueo propio. */
export async function DELETE(request: Request, ctx: Ctx) {
  return cambiar(request, ctx, false);
}

async function cambiar(request: Request, ctx: Ctx, bloquear: boolean) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id } = await ctx.params;
    await setConversationBlock(user, id, bloquear, requestInfo(request.headers));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}
