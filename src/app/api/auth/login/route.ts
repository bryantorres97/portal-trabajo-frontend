import { NextResponse, type NextRequest } from "next/server";

import { getSessionEnv, isAuthConfigured } from "@/lib/env";
import { buildAuthorizeUrl, parseIdentityProvider } from "@/server/auth/cognito";
import { createPkcePair, encryptPayload, randomToken } from "@/server/auth/crypto";
import { OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE_SECONDS, OAUTH_PURPOSE, cookieOptions } from "@/server/auth/session-cookie";
import { safeReturnTo } from "@/server/http/request-info";

/**
 * Inicia el flujo OIDC authorization code + PKCE contra Cognito.
 * Parámetros: `returnTo` (ruta interna) y `proveedor` opcional (Google | Facebook).
 */
export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/cuenta?error=auth_no_configurada", request.url));
  }

  const state = randomToken(24);
  const nonce = randomToken(24);
  const { verifier, challenge } = await createPkcePair();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));

  const cookie = await encryptPayload(
    { state, nonce, verifier, returnTo },
    getSessionEnv().SESSION_SECRET,
    OAUTH_PURPOSE,
    OAUTH_COOKIE_MAX_AGE_SECONDS,
  );

  const identityProvider = parseIdentityProvider(request.nextUrl.searchParams.get("proveedor"));
  const response = NextResponse.redirect(
    buildAuthorizeUrl({ state, nonce, codeChallenge: challenge, identityProvider }),
  );
  response.cookies.set(OAUTH_COOKIE, cookie, cookieOptions(OAUTH_COOKIE_MAX_AGE_SECONDS));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
