import { NextResponse, type NextRequest } from "next/server";

import { getSessionEnv, isAuthConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/audit/log";
import { exchangeCode, revokeRefreshToken } from "@/server/auth/cognito";
import { decryptPayload } from "@/server/auth/crypto";
import { createSession, resolveSession } from "@/server/auth/session";
import {
  INTERNAL_SESSION_MAX_AGE_SECONDS,
  OAUTH_COOKIE,
  OAUTH_PURPOSE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  cookieOptions,
} from "@/server/auth/session-cookie";
import {
  identityFromIdToken,
  isInternalUser,
  loadUser,
  upsertUserFromLogin,
  type IdentityClaims,
} from "@/server/auth/users";
import { verifyAccessToken, verifyIdToken } from "@/server/auth/verify";
import { requestInfo, safeReturnTo, type RequestContext } from "@/server/http/request-info";
import { linkIdentity } from "@/server/users/identities";

type OAuthState = { state: string; nonce: string; verifier: string; returnTo: string; intent?: "login" | "link" };

function fallo(request: NextRequest, motivo: string) {
  const response = NextResponse.redirect(new URL(`/cuenta?error=${motivo}`, request.url));
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

/** Recibe el código de Cognito, lo canjea, verifica los tokens y crea la sesión opaca. */
export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) return fallo(request, "auth_no_configurada");

  const params = request.nextUrl.searchParams;
  const info = requestInfo(request.headers);

  // El usuario canceló o Cognito devolvió un error.
  if (params.get("error")) return fallo(request, "login_cancelado");

  const code = params.get("code");
  const state = params.get("state");
  const cookie = request.cookies.get(OAUTH_COOKIE)?.value;
  const guardado = cookie
    ? await decryptPayload<OAuthState>(cookie, getSessionEnv().SESSION_SECRET, OAUTH_PURPOSE)
    : null;

  if (!code || !state || !guardado || guardado.state !== state) {
    logger.warn("auth.callback_invalid_state", { hasCode: !!code, hasCookie: !!cookie });
    return fallo(request, "login_invalido");
  }

  try {
    const tokens = await exchangeCode(code, guardado.verifier);
    if (!tokens.id_token) throw new Error("Cognito no devolvió ID token (¿falta el scope openid?)");

    const idClaims = await verifyIdToken(tokens.id_token, guardado.nonce);
    const accessClaims = await verifyAccessToken(tokens.access_token);
    if (idClaims.sub !== accessClaims.sub) throw new Error("Los tokens pertenecen a sujetos distintos");

    const identity = identityFromIdToken(idClaims);

    if (guardado.intent === "link") return await vincular(request, identity, tokens.refresh_token, info);

    const { user, created } = await upsertUserFromLogin(identity);

    if (user.status !== "ACTIVO") {
      await logAudit({
        action: "USER_LOGIN",
        actorId: user.id,
        result: "DENIED",
        metadata: { reason: `status:${user.status}` },
        ...info,
      });
      return fallo(request, "cuenta_bloqueada");
    }

    const appUser = await loadUser(user.id);
    const maxAge = appUser && isInternalUser(appUser) ? INTERNAL_SESSION_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
    const { cookieValue } = await createSession({ userId: user.id, tokens, maxAgeSeconds: maxAge, ...info });

    if (created)
      await logAudit({
        action: "USER_FIRST_LOGIN",
        actorId: user.id,
        resourceType: "user",
        resourceId: user.id,
        metadata: { provider: identity.provider },
        ...info,
      });
    await logAudit({
      action: "USER_LOGIN",
      actorId: user.id,
      actorRoles: appUser?.roles,
      metadata: { provider: identity.provider },
      ...info,
    });

    const response = NextResponse.redirect(new URL(safeReturnTo(guardado.returnTo), request.url));
    response.cookies.set(SESSION_COOKIE, cookieValue, cookieOptions(maxAge));
    response.cookies.delete(OAUTH_COOKIE);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    logger.error("auth.callback_failed", { error: e });
    await logAudit({ action: "USER_LOGIN_FAILED", result: "ERROR", ...info }).catch(() => undefined);
    return fallo(request, "login_fallido");
  }
}

/**
 * Vinculación (ADR-008): la identidad recién autenticada se agrega a la cuenta de la sesión
 * actual. No se crea una sesión nueva; el refresh token de la segunda identidad se revoca.
 */
async function vincular(
  request: NextRequest,
  identity: IdentityClaims,
  refreshToken: string | undefined,
  info: RequestContext,
) {
  if (refreshToken) await revokeRefreshToken(refreshToken);
  const session = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return fallo(request, "vinculo_sin_sesion");

  const resultado = await linkIdentity(session.userId, identity, info);
  const response = NextResponse.redirect(new URL(`/cuenta?vinculo=${resultado}`, request.url));
  response.cookies.delete(OAUTH_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
