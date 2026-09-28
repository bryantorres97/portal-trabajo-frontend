"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { startConversation } from "@/server/chat/chat";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";
import { getPendingConsents } from "@/server/users/consents";

export async function iniciarConversacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let destino: string | undefined;
  const estado = await runAction(async () => {
    const auth = await getCurrentAuth();
    if (!auth) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
    if (auth.source !== "COGNITO") throw new AuthError(403, "El chat es solo para cuentas de clientes y trabajadores.");
    if ((await getPendingConsents(auth.user.id)).length > 0) {
      throw new AuthError(403, "Primero acepta los términos y la política de privacidad vigentes.");
    }
    const r = await startConversation(auth.user, formToObject(formData), await currentRequestContext());
    destino = `/mensajes/${r.conversationId}`;
  });
  if (estado.status === "ok" && destino) redirect(destino);
  return estado;
}
