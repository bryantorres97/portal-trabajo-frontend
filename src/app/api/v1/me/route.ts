import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { clientProfileSchema } from "@/server/domain/users/schemas";
import { apiConsentedUser, apiUser } from "@/server/http/api-auth";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { requestInfo } from "@/server/http/request-info";
import { deleteAccount } from "@/server/users/account-deletion";
import { buildMe } from "@/server/users/me";
import { saveClientProfile } from "@/server/users/profile";

/** GET /api/v1/me — cuenta del usuario autenticado (web o app móvil). */
export async function GET() {
  try {
    const user = await apiUser();
    return NextResponse.json(await buildMe(user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/** PATCH /api/v1/me — actualiza el perfil de cliente (requiere consentimiento vigente). */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiConsentedUser();
    const input = await readJson(request, clientProfileSchema);
    const profile = await saveClientProfile(user.id, input, requestInfo(request.headers));
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/**
 * DELETE /api/v1/me — elimina la cuenta del titular de inmediato (ADR-018). 409 si tiene
 * contrataciones en marcha (ver GET /api/v1/me/deletion). No requiere consentimiento vigente:
 * quien no acepta los términos nuevos también puede irse.
 */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiUser();
    const result = await deleteAccount(user, requestInfo(request.headers));
    const response = NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (error) {
    return toProblem(error);
  }
}
