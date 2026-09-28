import { NextResponse } from "next/server";

import { listConversations, startConversation } from "@/server/chat/chat";
import { startConversationSchema } from "@/server/domain/chat/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";

/** GET /api/v1/conversations — bandeja del usuario (como cliente y como trabajador). */
export async function GET() {
  try {
    const user = await apiChatUser();
    return NextResponse.json({ items: await listConversations(user) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/**
 * POST /api/v1/conversations — `{ workerId, body, clientMessageId? }`. Inicia (o retoma) la
 * conversación con un trabajador habilitado y envía el primer mensaje. 429 al superar los límites.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const input = await readJson(request, startConversationSchema);
    const r = await startConversation(user, input, requestInfo(request.headers));
    return NextResponse.json(r, { status: r.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
