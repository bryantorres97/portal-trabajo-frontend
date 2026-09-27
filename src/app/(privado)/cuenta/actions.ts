"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { revokeUserSessions } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext, safeReturnTo } from "@/server/http/request-info";
import { acceptCurrentConsents } from "@/server/users/consents";
import { unlinkIdentity } from "@/server/users/identities";
import { saveClientProfile } from "@/server/users/profile";
import { markNotificationsRead, setNotificationPreferences } from "@/server/notifications/notifications";

async function requireAuth() {
  const auth = await getCurrentAuth();
  if (!auth) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  return auth;
}

export async function guardarPerfil(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAuth();
    await saveClientProfile(user.id, formToObject(formData), await currentRequestContext());
    refresh();
    return "Tu perfil se actualizó.";
  });
}

export async function aceptarConsentimiento(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const destino = safeReturnTo(String(formData.get("returnTo") ?? ""), "/cuenta");
  const resultado = await runAction(async () => {
    const { user } = await requireAuth();
    if (formData.get("acepto") !== "on") {
      throw new z.ZodError([
        { code: "custom", path: ["acepto"], message: "Debes aceptar los documentos para continuar.", input: undefined },
      ]);
    }
    await acceptCurrentConsents(user.id, await currentRequestContext());
  });
  if (resultado.status === "ok") redirect(destino);
  return resultado;
}

export async function cerrarSesion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, sessionId } = await requireAuth();
    const id = z.uuid().parse(formData.get("sessionId"));
    if (id === sessionId) throw new AuthError(403, "Para cerrar esta sesión usa «Cerrar sesión».");
    await revokeUserSessions(user.id, id);
    refresh();
    return "Sesión cerrada.";
  });
}

/** Cierra todas las sesiones del portal, incluida la actual, y revoca los refresh tokens. */
export async function cerrarTodasLasSesiones(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const resultado = await runAction(async () => {
    const { user } = await requireAuth();
    await revokeUserSessions(user.id);
  });
  if (resultado.status === "ok") {
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/?sesion=cerrada");
  }
  return resultado;
}

export async function desvincularIdentidad(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, identity } = await requireAuth();
    const identityId = z.coerce.number().int().positive().parse(formData.get("identityId"));
    await unlinkIdentity(user.id, identityId, identity, await currentRequestContext());
    refresh();
    return "Forma de ingreso eliminada.";
  });
}

export async function marcarNotificacionesLeidas(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAuth();
    await markNotificationsRead(user);
    refresh();
    return "Listo.";
  });
}

export async function guardarPreferenciasAvisos(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAuth();
    const { pushAnnouncements } = await setNotificationPreferences(user, {
      pushAnnouncements: formData.get("pushAnnouncements") === "on",
    });
    refresh();
    return pushAnnouncements
      ? "Recibirás los avisos del GAD en tus dispositivos."
      : "Ya no recibirás los avisos del GAD por push. Los verás en esta página.";
  });
}
