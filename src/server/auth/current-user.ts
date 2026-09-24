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

/**
 * Usuario de la sesión web actual (cookie), memoizado por request.
 * Verifica siempre el access token y el estado del usuario en la base (un usuario
 * BLOQUEADO queda denegado aunque su token de Cognito siga vigente).
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  // Leer cookies primero: marca la ruta como dinámica aunque el login no esté configurado
  // en el build (si no, Next pre-renderizaría la respuesta sin sesión de forma estática).
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookieValue || !isAuthConfigured()) return null;

  try {
    const session = await resolveSession(cookieValue);
    if (!session) return null;
    const claims = await verifyAccessToken(session.accessToken);
    // El token debe pertenecer a una identidad del usuario de la sesión.
    if ((await findUserIdByIdentity(claims.iss, claims.sub)) !== session.userId) return null;
    return await loadUser(session.userId);
  } catch (e) {
    logger.warn("auth.current_user_failed", { error: e });
    return null;
  }
});

/**
 * Usuario de un request de API: primero `Authorization: Bearer <access_token>`
 * (clientes móviles), luego la cookie de sesión web.
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

/** Para Server Components/páginas: redirige al login si no hay sesión. */
export async function requirePageUser(returnTo: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Para páginas administrativas: exige el permiso o lanza AuthError (403). */
export async function requirePagePermission(permission: string, returnTo: string): Promise<AppUser> {
  const user = await requirePageUser(returnTo);
  try {
    return requirePermission(user, permission);
  } catch (e) {
    if (e instanceof AuthError) redirect("/cuenta?error=forbidden");
    throw e;
  }
}
