"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";
import { getPendingConsents } from "@/server/users/consents";
import { redeemActivationCode } from "@/server/workers/activation";
import { proposeOwnPhoto, proposeOwnProfile, setOwnAvailability } from "@/server/workers/public-profile";

/** Solo cuentas ciudadanas (Cognito) con el consentimiento vigente (RN-18). */
async function ciudadano() {
  const auth = await getCurrentAuth();
  if (!auth) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  if (auth.source !== "COGNITO") throw new AuthError(403, "Esta sección es para la cuenta personal del trabajador.");
  if ((await getPendingConsents(auth.user.id)).length > 0) {
    throw new AuthError(403, "Primero acepta los términos y la política de privacidad vigentes.");
  }
  return auth.user;
}

export async function canjearCodigo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const r = await redeemActivationCode(await ciudadano(), formData.get("code"), await currentRequestContext());
    refresh();
    return r.result === "LINKED"
      ? "¡Listo! Tu cuenta quedó vinculada con tu ficha de trabajador."
      : "Tu cuenta ya estaba vinculada.";
  });
}

export async function cambiarDisponibilidad(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const disponible = await setOwnAvailability(
      await ciudadano(),
      { isAvailable: formData.get("isAvailable") === "true" },
      await currentRequestContext(),
    );
    refresh();
    return disponible ? "Ahora apareces como disponible." : "Ahora apareces como no disponible.";
  });
}

export async function proponerPerfil(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await proposeOwnProfile(await ciudadano(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Enviamos tus cambios al GAD. Se publicarán cuando los revisen.";
  });
}

export async function proponerFoto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await proposeOwnPhoto(await ciudadano(), formData.get("file"), await currentRequestContext());
    refresh();
    return "Enviamos tu foto al GAD. Se publicará cuando la revisen.";
  });
}
