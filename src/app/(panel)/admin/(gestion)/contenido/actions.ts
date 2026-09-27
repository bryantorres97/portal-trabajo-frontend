"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { deleteFaq, discardLegalDraft, publishLegal, saveFaq, saveLegalDraft } from "@/server/content/content";
import { DomainError } from "@/server/errors";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";

async function personal() {
  const auth = await getCurrentAuth();
  if (!auth) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  if (auth.source !== "ENTRA") throw new AuthError(403, "Ingresa con tu cuenta institucional.");
  return auth.user;
}

export async function guardarPregunta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const datos = formToObject(formData);
    await saveFaq(
      await personal(),
      { ...datos, published: formData.get("published") === "on" },
      await currentRequestContext(),
    );
    refresh();
    return datos.id ? "Pregunta actualizada." : "Pregunta creada.";
  });
}

export async function eliminarPregunta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteFaq(await personal(), String(formData.get("id") ?? ""), await currentRequestContext());
    refresh();
    return "Pregunta eliminada.";
  });
}

export async function guardarBorradorLegal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const version = await saveLegalDraft(await personal(), formToObject(formData), await currentRequestContext());
    refresh();
    return `Borrador de la versión ${version} guardado. Aún no es visible.`;
  });
}

export async function publicarLegal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    if (formData.get("confirmo") !== "on") {
      throw new DomainError(422, "Confirma que todas las personas deberán aceptar la nueva versión.");
    }
    await publishLegal(await personal(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Versión publicada. Se pedirá aceptarla en el próximo ingreso de cada persona.";
  });
}

export async function descartarBorradorLegal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await discardLegalDraft(await personal(), String(formData.get("code") ?? ""));
    refresh();
    return "Borrador descartado.";
  });
}
