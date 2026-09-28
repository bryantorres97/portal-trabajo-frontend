"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentUser } from "@/server/auth/current-user";
import { saveCategory, saveService, setServiceImage } from "@/server/catalog/catalog";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";

async function actor() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  return user;
}

export async function guardarCategoria(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const datos = formToObject(formData);
    await saveCategory(await actor(), datos, await currentRequestContext());
    refresh();
    return datos.id ? "Categoría actualizada." : "Categoría creada.";
  });
}

export async function guardarOficio(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const datos = formToObject(formData);
    await saveService(await actor(), datos, await currentRequestContext());
    refresh();
    return datos.id ? "Oficio actualizado." : "Oficio creado.";
  });
}

/** Sube la imagen elegida del oficio, o la quita si el formulario trae `quitar`. */
export async function cambiarImagen(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const quitar = formData.get("quitar") === "1";
    await setServiceImage(
      await actor(),
      { id: formData.get("id") },
      quitar ? null : formData.get("imagen"),
      await currentRequestContext(),
    );
    refresh();
    return quitar ? "Imagen quitada." : "Imagen actualizada.";
  });
}
