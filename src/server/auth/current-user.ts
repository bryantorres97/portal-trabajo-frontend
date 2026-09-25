import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { isAuthConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AuthError, requirePermission } from "@/server/auth/authorize";
import { resolveSession } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { findUserIdByIdentity, loadUser, type AppUser } from "@/server/auth/users";
import { verifyAccessToken } from "@/server/auth/verify";
import { getPendingConsents } from "@/server/users/consents";

export type CurrentAuth = {
  user: AppUser;
  sessionId: string;
  /** Identidad de Cognito con la que se abrió esta sesión (ADR-008). */
  identity: { issuer: string; sub: string };
};

/**
 * Sesión web actual (cookie), memoizada por request.
 * Verifica siempre el access token, que pertenezca a una identidad del usuario de la sesión
 * y que el usuario siga ACTIVO en la base (un usuario bloqueado queda fuera aunque su token
 * de Cognito siga vigente).
 */
export const getCurrentAuth = cache(async (): Promise<CurrentAuth | null> => {
  // Leer cookies primero: marca la ruta como dinámica aunque el login no esté configurado
  // en el build (si no, Next pre-renderizaría la respuesta sin sesión de forma estática).
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookieValue || !isAuthConfigured()) return null;

  try {
    const session = await resolveSession(cookieValue);
    if (!session) return null;
    const claims = await verifyAccessToken(session.accessToken);
    if ((await findUserIdByIdentity(claims.iss, claims.sub)) !== session.userId) return null;
    const user = await loadUser(session.userId);
    if (!user || user.status !== "ACTIVO") return null;
    return { user, sessionId: session.id, identity: { issuer: claims.iss, sub: claims.sub } };
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
 * aunque esté bloqueado, para que la autorización responda 403 (no 401).
 */
export async function getRequestUser(): Promise<AppUser | null> {
  const authorization = (await headers()).get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    if (!isAuthConfigured()) return null;
    try {
      const claims = await verifyAccessToken(authorization.slice("Bearer ".length).trim());
      const userId = await findUserIdByIdentity(claims.iss, claims.sub);
      return userId ? await loadUser(userId) : null;
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
 */
export async function requireConsentedPageAuth(returnTo: string): Promise<CurrentAuth> {
  const auth = await requirePageAuth(returnTo);
  if ((await getPendingConsents(auth.user.id)).length > 0) {
    redirect(`/cuenta/consentimiento?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return auth;
}

export async function requirePageUser(returnTo: string): Promise<AppUser> {
  return (await requirePageAuth(returnTo)).user;
}

/** Para páginas administrativas: exige consentimiento y el permiso (sin permiso → /cuenta). */
export async function requirePagePermission(permission: string, returnTo: string): Promise<AppUser> {
  const { user } = await requireConsentedPageAuth(returnTo);
  try {
    return requirePermission(user, permission);
  } catch (e) {
    if (e instanceof AuthError) redirect("/cuenta?error=forbidden");
    throw e;
  }
}
