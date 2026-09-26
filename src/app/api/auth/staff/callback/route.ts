import { NextResponse, type NextRequest } from "next/server";

import { getEntraEnv, getSessionEnv, isStaffAuthConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/audit/log";
import { decryptPayload } from "@/server/auth/crypto";
import { STAFF_SIGNIN_PATH, StaffAuthError, exchangeStaffCode, verifyStaffIdToken } from "@/server/auth/entra";
import { createSession, destroySession } from "@/server/auth/session";
import {
  INTERNAL_SESSION_MAX_AGE_SECONDS,
  OAUTH_COOKIE,
  OAUTH_PURPOSE,
  SESSION_COOKIE,
  cookieOptions,
} from "@/server/auth/session-cookie";
import { loadUser, upsertStaffFromLogin } from "@/server/auth/users";
import { requestInfo, safeReturnTo } from "@/server/http/request-info";

type OAuthState = { state: string; nonce: string; verifier: string; returnTo: string; flow?: string };

function fallo(request: NextRequest, motivo: string) {
  const response = NextResponse.redirect(new URL(`${STAFF_SIGNIN_PATH}?error=${motivo}`, request.url));
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

/**
 * Recibe el código de Entra ID, lo canjea, verifica el ID token (tenant, invitados, nonce),
 * da de alta al personal sin roles (o con el bootstrap del primer admin) y abre una sesión ENTRA de 12 h.
 */
export async function GET(request: NextRequest) {
  if (!isStaffAuthConfigured()) return fallo(request, "no_configurado");

  const params = request.nextUrl.searchParams;
  const info = requestInfo(request.headers);

  // Cancelación, usuario no asignado a la app, acceso condicional no cumplido, etc.
  const errorEntra = params.get("error");
  if (errorEntra) {
    logger.warn("auth.staff_callback_error", {
      error: errorEntra,
      description: params.get("error_description")?.slice(0, 300),
    });
    return fallo(request, errorEntra === "access_denied" ? "acceso_denegado" : "login_cancelado");
  }

  const code = params.get("code");
  const state = params.get("state");
  const cookie = request.cookies.get(OAUTH_COOKIE)?.value;
  const guardado = cookie
    ? await decryptPayload<OAuthState>(cookie, getSessionEnv().SESSION_SECRET, OAUTH_PURPOSE)
    : null;

  if (!code || !state || !guardado || guardado.flow !== "staff" || guardado.state !== state) {
    logger.warn("auth.staff_callback_invalid_state", { hasCode: !!code, hasCookie: !!cookie });
    return fallo(request, "login_invalido");
  }

  try {
    const tokens = await exchangeStaffCode(code, guardado.verifier);
    if (!tokens.id_token) throw new StaffAuthError("Entra ID no devolvió ID token");
    const identity = await verifyStaffIdToken(tokens.id_token, guardado.nonce);

    const staff = await upsertStaffFromLogin(
      identity,
      { bootstrapAdmin: getEntraEnv().ENTRA_BOOTSTRAP_ADMIN_OIDS.includes(identity.sub) },
      info,
    );
    if (staff.bootstrapped) logger.warn("auth.staff_bootstrap_admin", { userId: staff.userId });

    if (staff.status !== "ACTIVO") {
      await logAudit({
        action: "USER_LOGIN",
        actorId: staff.userId,
        result: "DENIED",
        metadata: { provider: "ENTRA", reason: `status:${staff.status}` },
        ...info,
      });
      return fallo(request, "cuenta_bloqueada");
    }

    // Una sesión previa en este navegador (p. ej. ciudadana) se cierra: una cookie, una sesión.
    await destroySession(request.cookies.get(SESSION_COOKIE)?.value);
    const { cookieValue } = await createSession({
      userId: staff.userId,
      tokens,
      maxAgeSeconds: INTERNAL_SESSION_MAX_AGE_SECONDS,
      source: "ENTRA",
      identity: { issuer: identity.issuer, sub: identity.sub },
      ...info,
    });

    const user = await loadUser(staff.userId, { source: "ENTRA" });
    await logAudit({
      action: "USER_LOGIN",
      actorId: staff.userId,
      actorRoles: user?.roles,
      metadata: { provider: "ENTRA" },
      ...info,
    });

    const response = NextResponse.redirect(new URL(safeReturnTo(guardado.returnTo, "/admin"), request.url));
    response.cookies.set(SESSION_COOKIE, cookieValue, cookieOptions(INTERNAL_SESSION_MAX_AGE_SECONDS));
    response.cookies.delete(OAUTH_COOKIE);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    const motivo = e instanceof StaffAuthError ? e.reason : "error";
    logger.error("auth.staff_callback_failed", { error: e, reason: motivo });
    await logAudit({
      action: "USER_LOGIN_FAILED",
      result: motivo === "guest" || motivo === "tenant" ? "DENIED" : "ERROR",
      metadata: { provider: "ENTRA", reason: motivo },
      ...info,
    }).catch(() => undefined);
    if (motivo === "guest") return fallo(request, "cuenta_externa");
    if (motivo === "tenant" || motivo === "nonce") return fallo(request, "login_invalido");
    return fallo(request, "login_fallido");
  }
}
