import { NextResponse } from "next/server";

import { markConversationRead } from "@/server/chat/chat";
import { markReadSchema } from "@/server/domain/chat/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";

/** POST /api/v1/conversations/{id}/read — `{ lastMessageId? }` marca como leído hasta ese mensaje. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/conversations/[id]/read">) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id } = await ctx.params;
    const input = await readJson(request, markReadSchema);
    return NextResponse.json({ lastReadId: await markConversationRead(user, id, input) });
  } catch (error) {
    return toProblem(error);
  }
}
