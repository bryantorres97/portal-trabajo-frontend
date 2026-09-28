import "server-only";

import { logAudit } from "@/server/audit/log";
import { AuthError } from "@/server/auth/authorize";
import {
  findIdentityOwner,
  identityFromIdToken,
  isAuthTimeRevoked,
  loadUser,
  upsertUserFromLogin,
  type AppUser,
} from "@/server/auth/users";
import { verifyAccessToken, verifyMobileIdToken } from "@/server/auth/verify";
import { mobileBootstrapSchema } from "@/server/domain/users/schemas";
import type { RequestContext } from "@/server/http/request-info";

/**
 * Primer ingreso de la app móvil (Fase 11). La web crea al usuario en su callback OIDC; la app
 * canjea el código por su cuenta (cliente público con PKCE) y llega solo con tokens. Este paso
 * hace lo mismo que el callback: verifica ambos tokens, resuelve o crea el usuario con rol CLIENTE
 * (ADR-008) y audita el ingreso. Es idempotente: la app puede llamarlo en cada inicio de sesión.
 */
export async function bootstrapMobileUser(
  accessToken: string,
  input: unknown,
  ctx: RequestContext,
): Promise<{ user: AppUser; created: boolean }> {
  const { idToken } = mobileBootstrapSchema.parse(input);

  let access: Awaited<ReturnType<typeof verifyAccessToken>>;
  let id: Awaited<ReturnType<typeof verifyMobileIdToken>>;
  try {
    [access, id] = await Promise.all([verifyAccessToken(accessToken), verifyMobileIdToken(idToken)]);
  } catch {
    throw new AuthError(401, "Los tokens no son válidos o vencieron. Vuelve a iniciar sesión.");
  }
  // Mismo inicio de sesión: mismo sujeto y el ID token emitido para el cliente del access token.
  const audiencias = Array.isArray(id.aud) ? id.aud : [id.aud];
  if (id.sub !== access.sub || !audiencias.includes(access.client_id)) {
    throw new AuthError(401, "Los tokens no pertenecen al mismo inicio de sesión.");
  }

  const identity = identityFromIdToken(id);
  const previo = await findIdentityOwner(identity.issuer, identity.sub);
  if (previo && isAuthTimeRevoked(access.auth_time ?? access.iat, previo.tokensValidAfter)) {
    throw new AuthError(401, "Cerraste la sesión en todos los dispositivos. Vuelve a iniciar sesión.");
  }

  const { user, created } = await upsertUserFromLogin(identity);
  const metadata = { provider: identity.provider, channel: "APP", clientId: access.client_id };

  if (user.status !== "ACTIVO") {
    await logAudit({
      action: "USER_LOGIN",
      actorId: user.id,
      result: "DENIED",
      metadata: { ...metadata, reason: `status:${user.status}` },
      ...ctx,
    });
    throw new AuthError(403, "Tu cuenta está bloqueada. Comunícate con el GAD Municipalidad de Ambato.");
  }

  const appUser = await loadUser(user.id, { source: "COGNITO" });
  if (!appUser) throw new AuthError(401, "No se encontró la cuenta.");

  if (created)
    await logAudit({
      action: "USER_FIRST_LOGIN",
      actorId: user.id,
      resourceType: "user",
      resourceId: user.id,
      metadata,
      ...ctx,
    });
  await logAudit({ action: "USER_LOGIN", actorId: user.id, actorRoles: appUser.roles, metadata, ...ctx });

  return { user: appUser, created };
}
