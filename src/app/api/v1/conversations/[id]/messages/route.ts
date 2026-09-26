import { NextResponse } from "next/server";

import { listMessages, sendMessage } from "@/server/chat/chat";
import { sendMessageSchema } from "@/server/domain/chat/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";

/** GET /api/v1/conversations/{id}/messages?before=&limit= — historial en orden cronológico. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/conversations/[id]/messages">) {
  try {
    const user = await apiChatUser();
    const { id } = await ctx.params;
    const sp = new URL(request.url).searchParams;
    const r = await listMessages(user, id, {
      before: sp.get("before") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/** POST /api/v1/conversations/{id}/messages — `{ body, clientMessageId? }` (idempotente por clientMessageId). */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/conversations/[id]/messages">) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id } = await ctx.params;
    const input = await readJson(request, sendMessageSchema);
    const messageId = await sendMessage(user, id, input);
    return NextResponse.json({ id: messageId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
