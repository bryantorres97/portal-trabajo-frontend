import { NextResponse, type NextRequest } from "next/server";

import { getSessionEnv, isStaffAuthConfigured } from "@/lib/env";
import { createPkcePair, encryptPayload, randomToken } from "@/server/auth/crypto";
import { STAFF_SIGNIN_PATH, buildStaffAuthorizeUrl } from "@/server/auth/entra";
import { OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE_SECONDS, OAUTH_PURPOSE, cookieOptions } from "@/server/auth/session-cookie";
import { safeReturnTo } from "@/server/http/request-info";

/**
 * Inicia el ingreso del personal del GAD con Microsoft Entra ID (ADR-012):
 * authorization code + PKCE + state + nonce. `returnTo` solo puede apuntar al panel.
 */
export async function GET(request: NextRequest) {
  if (!isStaffAuthConfigured()) {
    return NextResponse.redirect(new URL(`${STAFF_SIGNIN_PATH}?error=no_configurado`, request.url));
  }

  const state = randomToken(24);
  const nonce = randomToken(24);
  const { verifier, challenge } = await createPkcePair();
  const destino = safeReturnTo(request.nextUrl.searchParams.get("returnTo"), "/admin");
  const returnTo = destino === "/admin" || destino.startsWith("/admin/") ? destino : "/admin";

  const cookie = await encryptPayload(
    { state, nonce, verifier, returnTo, flow: "staff" },
    getSessionEnv().SESSION_SECRET,
    OAUTH_PURPOSE,
    OAUTH_COOKIE_MAX_AGE_SECONDS,
  );

  const response = NextResponse.redirect(buildStaffAuthorizeUrl({ state, nonce, codeChallenge: challenge }));
  response.cookies.set(OAUTH_COOKIE, cookie, cookieOptions(OAUTH_COOKIE_MAX_AGE_SECONDS));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
