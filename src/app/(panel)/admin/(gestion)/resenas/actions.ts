"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentUser } from "@/server/auth/current-user";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";
import { setReviewHidden } from "@/server/reviews/reviews";

export async function moderarResena(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
    const estado = await setReviewHidden(user, formToObject(formData), await currentRequestContext());
    refresh();
    return estado === "OCULTA"
      ? "Reseña ocultada: ya no cuenta en el promedio y sus denuncias quedaron resueltas."
      : "Reseña restaurada.";
  });
}
