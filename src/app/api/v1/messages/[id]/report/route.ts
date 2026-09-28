import { NextResponse } from "next/server";

import { reportMessage } from "@/server/chat/chat";
import { reportMessageSchema } from "@/server/domain/chat/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";

/** POST /api/v1/messages/{id}/report — `{ reasonCode, description? }` denuncia un mensaje recibido. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/messages/[id]/report">) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id } = await ctx.params;
    const input = await readJson(request, reportMessageSchema);
    const reportId = await reportMessage(user, Number(id), input, requestInfo(request.headers));
    return NextResponse.json({ id: reportId }, { status: 201 });
  } catch (error) {
    return toProblem(error);
  }
}
