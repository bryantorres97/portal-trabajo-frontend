import "server-only";

import { AuthError, requireUser } from "@/server/auth/authorize";
import { getRequestUser } from "@/server/auth/current-user";
import type { AppUser } from "@/server/auth/users";
import { getPendingConsents } from "@/server/users/consents";

/** Usuario autenticado y activo del request de API (Bearer o cookie). 401/403 si no. */
export async function apiUser(): Promise<AppUser> {
  return requireUser(await getRequestUser());
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
