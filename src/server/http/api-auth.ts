import "server-only";

import { AuthError, requireUser } from "@/server/auth/authorize";
import { getRequestUser } from "@/server/auth/current-user";
import type { AppUser } from "@/server/auth/users";
import { getPendingConsents } from "@/server/users/consents";

/** Usuario autenticado y activo del request de API (Bearer o cookie). 401/403 si no. */
export async function apiUser(): Promise<AppUser> {
  return requireUser(await getRequestUser());
}

/**
 * Participante del chat: cuenta ciudadana (CLIENTE o TRABAJADOR) con consentimiento vigente.
 * El personal del GAD no participa en conversaciones (RN-09).
 */
export async function apiChatUser(): Promise<AppUser> {
  const user = await apiConsentedUser();
  if (!user.roles.some((r) => r === "CLIENTE" || r === "TRABAJADOR")) {
    throw new AuthError(403, "El chat es solo para cuentas de clientes y trabajadores.");
  }
  return user;
}

/** Además exige consentimiento vigente (RN-18) para operaciones transaccionales. */
export async function apiConsentedUser(): Promise<AppUser> {
  const user = await apiUser();
  if ((await getPendingConsents(user.id)).length > 0) {
    throw new AuthError(
      403,
      "Debes aceptar los términos y la política de privacidad vigentes (POST /api/v1/me/consents).",
    );
  }
  return user;
}
