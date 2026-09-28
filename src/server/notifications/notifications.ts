import "server-only";

import { getSessionEnv, isFcmConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requireUser } from "@/server/auth/authorize";
import { hmacHex } from "@/server/auth/crypto";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { deviceSchema, markNotificationsSchema } from "@/server/domain/chat/schemas";
import {
  bajaDispositivoSchema,
  dispositivoAnonimoSchema,
  preferenciasSchema,
} from "@/server/domain/notifications/schemas";
import { DomainError, throwPg } from "@/server/errors";
import { isValidPushToken, sendPush, type PushMessage } from "@/server/notifications/fcm";

/**
 * Notificaciones: in-app (tabla `notifications`, se crean en la misma transacción que el evento)
 * y push por FCM a través del outbox (`notification_outbox`), que despacha el servidor.
 */

export type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listNotifications(user: AppUser, limit = 20) {
  requireUser(user);
  const db = getAdminDb();
  const [lista, pendientes] = await Promise.all([
    db
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100))
      .returns<
        {
          id: number;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        }[]
      >(),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  if (lista.error) throw lista.error;
  if (pendientes.error) throw pendientes.error;
  return {
    unread: pendientes.count ?? 0,
    items: (lista.data ?? []).map<AppNotification>((n) => ({
      id: Number(n.id),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
  };
}

export async function markNotificationsRead(user: AppUser, input: unknown = {}) {
  requireUser(user);
  const { ids } = markNotificationsSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_mark_notifications_read", {
    p_user_id: user.id,
    p_ids: ids ?? null,
  });
  if (error) throwPg(error);
  return Number(data);
}

/**
 * Registra el token FCM del dispositivo del usuario. En la web se liga a la sesión: al cerrarla,
 * el navegador deja de recibir push (la app móvil, con Bearer, no tiene sesión del portal).
 */
export async function registerDevice(user: AppUser, input: unknown, sessionId: string | null = null) {
  requireUser(user);
  const d = deviceSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_register_device", {
    p_user_id: user.id,
    p_platform: d.platform,
    p_token: d.token,
    p_session_id: sessionId,
  });
  if (error) throwPg(error);
}

export async function unregisterDevice(user: AppUser, input: unknown) {
  requireUser(user);
  const d = bajaDispositivoSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_unregister_device", {
    p_user_id: user.id,
    p_token: d.token,
    p_keep_anonymous: d.keepAnonymous,
  });
  if (error) throwPg(error);
}

/**
 * App móvil sin sesión: registra el dispositivo como anónimo (solo recibe los avisos del GAD para
 * «todos los dispositivos»). FCM confirma que el token es de este proyecto; máximo 30 por IP y hora.
 */
export async function registerAnonymousDevice(input: unknown, ip: string | null, validar = isValidPushToken) {
  const d = dispositivoAnonimoSchema.parse(input);
  if (!isFcmConfigured()) throw new DomainError(422, "Las notificaciones push no están configuradas en este ambiente.");
  if (!(await validar(d.token)))
    throw new DomainError(422, "El token no es un token válido de Firebase para esta app.");
  const ipHash = await hmacHex(ip ?? "sin-ip", getSessionEnv().SESSION_SECRET, "device-ip");
  const { data, error } = await getAdminDb().rpc("fn_register_anonymous_device", {
    p_platform: d.platform,
    p_token: d.token,
    p_ip_hash: ipHash,
  });
  if (error) throwPg(error);
  if (data === "RATE_LIMITED") {
    throw new DomainError(
      429,
      "Demasiados dispositivos registrados desde esta red. Inténtalo más tarde.",
      "rate_limited",
    );
  }
}

export async function getNotificationPreferences(user: AppUser): Promise<{ pushAnnouncements: boolean }> {
  requireUser(user);
  const { data, error } = await getAdminDb()
    .from("users")
    .select("push_announcements")
    .eq("id", user.id)
    .single<{ push_announcements: boolean }>();
  if (error) throw error;
  return { pushAnnouncements: data.push_announcements };
}

/** Avisos del GAD por push (los del chat y las contrataciones no dependen de esta preferencia). */
export async function setNotificationPreferences(
  user: AppUser,
  input: unknown,
): Promise<{ pushAnnouncements: boolean }> {
  requireUser(user);
  const d = preferenciasSchema.parse(input);
  const { error } = await getAdminDb()
    .from("users")
    .update({ push_announcements: d.pushAnnouncements })
    .eq("id", user.id);
  if (error) throw error;
  return d;
}

type OutboxRow = {
  id: number;
  event: string;
  recipient_id: string;
  payload: PushMessage & Record<string, unknown>;
  tokens: string[];
};

/**
 * Despacha un lote del outbox. Sin FCM configurado no toma nada (los envíos quedan pendientes y
 * se envían cuando se configure). Devuelve cuántos se enviaron y cuántos fallaron.
 */
export async function dispatchOutbox(
  limit = 50,
  send = sendPush,
): Promise<{ claimed: number; sent: number; failed: number; skipped: boolean }> {
  if (!isFcmConfigured()) return { claimed: 0, sent: 0, failed: 0, skipped: true };
  const db = getAdminDb();
  const { data, error } = await db.rpc("fn_claim_outbox", { p_limit: limit });
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const o of (data ?? []) as OutboxRow[]) {
    const invalidos: string[] = [];
    let alguno = false;
    let ultimoError: string | undefined;
    for (const token of o.tokens) {
      try {
        const r = await send(token, {
          title: String(o.payload.title),
          body: String(o.payload.body ?? ""),
          link: String(o.payload.link ?? "/"),
          data: { event: o.event },
        });
        if (r.ok) alguno = true;
        else {
          ultimoError = r.error;
          if (r.invalidToken) invalidos.push(token);
        }
      } catch (e) {
        ultimoError = e instanceof Error ? e.message : String(e);
      }
    }
    // Llegó a algún dispositivo → ENVIADA; sin dispositivos válidos → DESCARTADA; si no, se reintenta.
    const resultado = alguno ? "ENVIADA" : invalidos.length === o.tokens.length ? "DESCARTADA" : "REINTENTAR";
    const { error: e2 } = await db.rpc("fn_complete_outbox", {
      p_id: o.id,
      p_result: resultado,
      p_error: resultado === "ENVIADA" ? null : (ultimoError ?? "Sin dispositivos activos"),
      p_invalid_tokens: invalidos.length ? invalidos : null,
    });
    if (e2) logger.error("outbox.complete_failed", { id: o.id, error: e2.message });
    if (resultado === "ENVIADA") sent++;
    else if (resultado === "REINTENTAR") failed++;
  }
  return { claimed: (data ?? []).length, sent, failed, skipped: false };
}
