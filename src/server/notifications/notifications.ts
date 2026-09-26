import "server-only";

import { isFcmConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { deviceSchema, markNotificationsSchema } from "@/server/domain/chat/schemas";
import { throwPg } from "@/server/errors";
import { sendPush, type PushMessage } from "@/server/notifications/fcm";

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

export async function registerDevice(user: AppUser, input: unknown) {
  requireUser(user);
  const d = deviceSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_register_device", {
    p_user_id: user.id,
    p_platform: d.platform,
    p_token: d.token,
  });
  if (error) throwPg(error);
}

export async function unregisterDevice(user: AppUser, token: string) {
  requireUser(user);
  const { error } = await getAdminDb().rpc("fn_unregister_device", { p_user_id: user.id, p_token: token });
  if (error) throwPg(error);
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
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!isFcmConfigured()) return { sent: 0, failed: 0, skipped: true };
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
  return { sent, failed, skipped: false };
}
