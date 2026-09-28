import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiConsentedUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";
import { redeemActivationCode } from "@/server/workers/activation";

/**
 * POST /api/v1/me/worker/link — canjea el código de activación `{ "code": "ABCD-2345" }`.
 * 422 código inválido o vencido · 429 tras 5 intentos fallidos en 15 minutos.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiConsentedUser();
    const { code } = await readJson(request, z.object({ code: z.string().max(20) }));
    const r = await redeemActivationCode(user, code, requestInfo(request.headers));
    return NextResponse.json(r, {
      status: r.result === "LINKED" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toProblem(error);
  }
}
