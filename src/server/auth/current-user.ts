import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { isAuthConfigured, isStaffAuthConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { hasPermission } from "@/server/auth/authorize";
import { STAFF_SIGNIN_PATH } from "@/server/auth/entra";
import { resolveSession, type AuthSource, type SessionIdentity } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { findBearerUserId, findUserIdByIdentity, loadUser, type AppUser } from "@/server/auth/users";
import { verifyAccessToken } from "@/server/auth/verify";
import { getPendingConsents } from "@/server/users/consents";

export type CurrentAuth = {
  /** Usuario con los roles que valen en este tipo de sesión (ver `loadUser`). */
  user: AppUser;
  sessionId: string;
  /** COGNITO (ciudadanos) o ENTRA (personal del GAD, ADR-012). */
  source: AuthSource;
  /** Identidad con la que se abrió esta sesión (ADR-008). */
  identity: SessionIdentity;
};

/**
 * Sesión web actual (cookie), memoizada por request.
 * Verifica que la identidad de la sesión siga perteneciendo al usuario y que este siga ACTIVO
 * en la base (un usuario bloqueado queda fuera aunque su token siga vigente). En sesiones de
 * Cognito verifica además el access token; en las de Entra, la identidad se validó con el ID
 * token al abrir la sesión y cada renovación vuelve a consultar a Entra.
 */
export const getCurrentAuth = cache(async (): Promise<CurrentAuth | null> => {
  // Leer cookies primero: marca la ruta como dinámica aunque el login no esté configurado
  // en el build (si no, Next pre-renderizaría la respuesta sin sesión de forma estática).
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookieValue || (!isAuthConfigured() && !isStaffAuthConfigured())) return null;

  try {
    const session = await resolveSession(cookieValue);
    if (!session) return null;
    let identity: SessionIdentity;
    if (session.source === "ENTRA") {
      if (!session.identity || !isStaffAuthConfigured()) return null;
      identity = session.identity;
    } else {
      if (!isAuthConfigured()) return null;
      const claims = await verifyAccessToken(session.accessToken);
      identity = { issuer: claims.iss, sub: claims.sub };
    }
    if ((await findUserIdByIdentity(identity.issuer, identity.sub)) !== session.userId) return null;
    const user = await loadUser(session.userId, { source: session.source });
    if (!user || user.status !== "ACTIVO") return null;
    return { user, sessionId: session.id, source: session.source, identity };
  } catch (e) {
    logger.warn("auth.current_user_failed", { error: e });
    return null;
  }
});

export async function getCurrentUser(): Promise<AppUser | null> {
  return (await getCurrentAuth())?.user ?? null;
}

/**
 * Usuario de un request de API: primero `Authorization: Bearer <access_token>`
 * (clientes móviles), luego la cookie de sesión web. Con Bearer se devuelve el usuario
 * aunque esté bloqueado, para que la autorización responda 403 (no 401). Un Bearer de Cognito
 * nunca lleva permisos internos (ADR-012). Un token autenticado antes del último «cerrar sesión en
 * todos los dispositivos» no resuelve usuario (401): la app debe volver a ingresar.
 */
export async function getRequestUser(): Promise<AppUser | null> {
  const authorization = (await headers()).get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    if (!isAuthConfigured()) return null;
    try {
      const claims = await verifyAccessToken(authorization.slice("Bearer ".length).trim());
      const userId = await findBearerUserId(claims.iss, claims.sub, claims.auth_time ?? claims.iat);
      return userId ? await loadUser(userId, { source: "COGNITO" }) : null;
    } catch {
      return null;
    }
  }
  return getCurrentUser();
}

/** Para páginas: redirige al login si no hay sesión. */
export async function requirePageAuth(returnTo: string): Promise<CurrentAuth> {
  const auth = await getCurrentAuth();
  if (!auth) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return auth;
}

/**
 * Para páginas que operan con la cuenta: exige sesión y consentimiento vigente (RN-18).
 * Sin consentimiento, redirige a /cuenta/consentimiento y luego vuelve a `returnTo`.
 * El personal (sesión de Entra) no acepta los términos ciudadanos.
 */
export async function requireConsentedPageAuth(returnTo: string): Promise<CurrentAuth> {
  const auth = await requirePageAuth(returnTo);
  if (auth.source === "COGNITO" && (await getPendingConsents(auth.user.id)).length > 0) {
    redirect(`/cuenta/consentimiento?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return auth;
}

export async function requirePageUser(returnTo: string): Promise<AppUser> {
  return (await requirePageAuth(returnTo)).user;
}

/**
 * Para páginas administrativas: exige una sesión del personal (Entra ID, ADR-012) y el permiso.
 * Sin sesión o con una sesión ciudadana → pantalla de ingreso del personal.
 */
export async function requirePagePermission(permission: string, returnTo: string): Promise<AppUser> {
  const auth = await getCurrentAuth();
  const ingreso = `${STAFF_SIGNIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
  if (!auth) redirect(ingreso);
  if (auth.source !== "ENTRA") redirect(`${ingreso}&error=cuenta_ciudadana`);
  if (!hasPermission(auth.user, permission)) {
    redirect(
      hasPermission(auth.user, "admin.access") ? "/admin?error=forbidden" : `${STAFF_SIGNIN_PATH}?error=sin_permisos`,
    );
  }
  return auth.user;
}
