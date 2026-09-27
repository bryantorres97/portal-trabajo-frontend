import { NextResponse } from "next/server";

import { listContracts, proposeContract } from "@/server/contracts/contracts";
import { proposeSchema } from "@/server/domain/contracts/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";

/** GET /api/v1/contracts?scope=activas|historial|todas[&conversationId=] — «Mis contrataciones». */
export async function GET(request: Request) {
  try {
    const user = await apiChatUser();
    const sp = new URL(request.url).searchParams;
    const items = await listContracts(
      user,
      { scope: sp.get("scope") ?? undefined },
      sp.get("conversationId") ?? undefined,
    );
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/**
 * POST /api/v1/contracts — `{ conversationId, terms }`. Primera propuesta de condiciones desde una
 * conversación (versión 1, aceptada por quien la envía). 409 si ya hay una propuesta abierta.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const input = await readJson(request, proposeSchema);
    const id = await proposeContract(user, input, requestInfo(request.headers));
    return NextResponse.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
