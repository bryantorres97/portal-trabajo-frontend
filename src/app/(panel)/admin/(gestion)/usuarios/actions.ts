"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentUser } from "@/server/auth/current-user";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";
import { grantRole, revokeRole, setUserStatus } from "@/server/users/admin";

async function actor() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  return user;
}

export async function asignarRol(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await grantRole(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Rol asignado.";
  });
}

export async function revocarRol(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await revokeRole(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Rol revocado.";
  });
}

export async function cambiarEstado(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const datos = formToObject(formData);
    await setUserStatus(await actor(), datos, await currentRequestContext());
    refresh();
    return datos.status === "BLOQUEADO" ? "Usuario bloqueado y sesiones cerradas." : "Usuario desbloqueado.";
  });
}
