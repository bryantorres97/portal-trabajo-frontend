"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { isFcmConfigured } from "@/lib/env";
import { AuthError, requirePermission } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";
import {
  cancelCampaign,
  createCampaign,
  estimateAudience,
  searchRecipients,
  type Audiencia,
  type Destinatario,
} from "@/server/notifications/campaigns";
import { dispatchPending } from "@/server/notifications/dispatcher";

async function personal() {
  const auth = await getCurrentAuth();
  if (!auth) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  if (auth.source !== "ENTRA") throw new AuthError(403, "Ingresa con tu cuenta institucional.");
  return auth.user;
}

/** Datos del formulario de un aviso (las casillas y listas llegan repetidas en el FormData). */
function leerAviso(formData: FormData) {
  const texto = (k: string) => String(formData.get(k) ?? "");
  return {
    title: texto("title"),
    body: texto("body"),
    link: texto("link"),
    segment: texto("segment"),
    platforms: formData.getAll("platforms").map(String),
    userIds: formData.getAll("userIds").map(String),
    deviceIds: formData.getAll("deviceIds").map(String),
    alsoInApp: formData.get("alsoInApp") === "on",
    scheduledAt: formData.get("cuando") === "programar" ? texto("scheduledAt") : "",
  };
}

export async function crearAviso(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    if (formData.get("confirmo") !== "on") {
      throw new DomainError(422, "Confirma que revisaste el aviso y sus destinatarios.");
    }
    const aviso = leerAviso(formData);
    await createCampaign(await personal(), aviso, await currentRequestContext());
    refresh();
    if (aviso.scheduledAt) return "Aviso programado. Puedes cancelarlo antes de la hora de envío.";
    return isFcmConfigured()
      ? "Aviso creado: se está enviando."
      : "Aviso creado. Se enviará cuando se configure Firebase en este ambiente.";
  });
}

export async function cancelarAviso(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await cancelCampaign(await personal(), String(formData.get("id") ?? ""), await currentRequestContext());
    refresh();
    return "Aviso cancelado. Los envíos pendientes no saldrán.";
  });
}

export async function procesarPendientes(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    requirePermission(await personal(), "notifications.broadcast");
    if (!isFcmConfigured()) throw new DomainError(422, "Firebase no está configurado en este ambiente.");
    const r = await dispatchPending({ budgetMs: 40_000 });
    refresh();
    const enviados = r.campaigns.sent + r.outbox.sent;
    const fallidos = r.campaigns.failed + r.outbox.failed;
    return `Envíos procesados: ${enviados} entregados${fallidos ? `, ${fallidos} se reintentarán` : ""}${
      r.campaigns.discarded ? `, ${r.campaigns.discarded} descartados por dispositivos inválidos` : ""
    }.`;
  });
}

export type ResultadoAudiencia = { ok: true; audiencia: Audiencia } | { ok: false; error: string };

/** Estimación en vivo para el formulario (no modifica nada). */
export async function estimarAudiencia(input: unknown): Promise<ResultadoAudiencia> {
  try {
    return { ok: true, audiencia: await estimateAudience(await personal(), input) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof DomainError || error instanceof AuthError ? error.message : "No pudimos calcularlo.",
    };
  }
}

export type ResultadoBusqueda = { ok: true; personas: Destinatario[] } | { ok: false; error: string };

export async function buscarDestinatarios(q: string): Promise<ResultadoBusqueda> {
  try {
    return { ok: true, personas: await searchRecipients(await personal(), { q }) };
  } catch (error) {
    if (error instanceof DomainError || error instanceof AuthError) return { ok: false, error: error.message };
    if (error instanceof Error && error.name === "ZodError")
      return { ok: false, error: "Escribe al menos 3 caracteres." };
    return { ok: false, error: "No pudimos buscar. Inténtalo de nuevo." };
  }
}
