import "server-only";

import { z } from "zod";

import { requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import {
  audienciaSchema,
  busquedaDestinatariosSchema,
  crearCampanaSchema,
  type EstadoCampana,
  type Plataforma,
  type Segmento,
} from "@/server/domain/notifications/schemas";
import { throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";
import { scheduleDispatch } from "@/server/notifications/dispatcher";

/**
 * Avisos push del GAD (notifications.broadcast): a todos los dispositivos, a usuarios registrados,
 * solo a clientes, solo a trabajadores o a personas y dispositivos elegidos. La audiencia se fija
 * al iniciar el envío; cada creación y cancelación queda en la auditoría.
 */

const PERMISO = "notifications.broadcast";

export type Audiencia = {
  devices: number;
  anonymousDevices: number;
  pushUsers: number;
  inAppUsers: number;
  byPlatform: Record<Plataforma, number>;
};

export async function estimateAudience(actor: AppUser, input: unknown): Promise<Audiencia> {
  requirePermission(actor, PERMISO);
  const d = audienciaSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_push_audience", {
    p_actor_id: actor.id,
    p_segment: d.segment,
    p_platforms: d.platforms,
    p_user_ids: d.segment === "SELECCION" ? d.userIds : [],
    p_device_ids: d.segment === "SELECCION" ? d.deviceIds : [],
  });
  if (error) throwPg(error);
  return data as Audiencia;
}

export async function createCampaign(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requirePermission(actor, PERMISO);
  const d = crearCampanaSchema().parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_create_push_campaign", {
    p_actor_id: actor.id,
    p_title: d.title,
    p_body: d.body,
    p_link: d.link,
    p_segment: d.segment,
    p_platforms: d.platforms,
    p_user_ids: d.userIds,
    p_device_ids: d.deviceIds,
    p_also_in_app: d.alsoInApp,
    p_scheduled_at: d.scheduledAt?.toISOString() ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  if (!d.scheduledAt) scheduleDispatch(45_000);
  return data as string;
}

export async function cancelCampaign(actor: AppUser, id: string, ctx: RequestContext): Promise<void> {
  requirePermission(actor, PERMISO);
  const { error } = await getAdminDb().rpc("fn_admin_cancel_push_campaign", {
    p_actor_id: actor.id,
    p_id: z.uuid().parse(id),
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

export type Campana = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  segment: Segmento;
  platforms: Plataforma[];
  targetUsers: number;
  targetDevices: number;
  alsoInApp: boolean;
  status: EstadoCampana;
  scheduledAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdByName: string | null;
  totalDevices: number;
  inAppUsers: number;
  sent: number;
  failed: number;
  discarded: number;
};

export async function listCampaigns(
  actor: AppUser,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ items: Campana[]; total: number }> {
  requirePermission(actor, PERMISO);
  const { data, error } = await getAdminDb().rpc("fn_admin_push_campaigns", {
    p_actor_id: actor.id,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as {
    id: string;
    title: string;
    body: string;
    link: string | null;
    segment: Segmento;
    platforms: Plataforma[];
    target_users: number;
    target_devices: number;
    also_in_app: boolean;
    status: EstadoCampana;
    scheduled_at: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    created_by_name: string | null;
    total_devices: number;
    in_app_users: number;
    sent_count: number;
    failed_count: number;
    discarded_count: number;
    total_count: number | string;
  }[];
  return {
    total: Number(filas[0]?.total_count ?? 0),
    items: filas.map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      link: c.link,
      segment: c.segment,
      platforms: c.platforms,
      targetUsers: c.target_users,
      targetDevices: c.target_devices,
      alsoInApp: c.also_in_app,
      status: c.status,
      scheduledAt: c.scheduled_at,
      createdAt: c.created_at,
      startedAt: c.started_at,
      completedAt: c.completed_at,
      cancelledAt: c.cancelled_at,
      createdByName: c.created_by_name,
      totalDevices: c.total_devices,
      inAppUsers: c.in_app_users,
      sent: c.sent_count,
      failed: c.failed_count,
      discarded: c.discarded_count,
    })),
  };
}

export type Destinatario = {
  userId: string;
  displayName: string | null;
  email: string | null;
  roles: string[];
  pushAnnouncements: boolean;
  status: string;
  devices: { id: number; platform: Plataforma; lastSeenAt: string }[];
};

/** Buscador del segmento «personas o dispositivos elegidos»: cuentas ciudadanas por nombre o correo. */
export async function searchRecipients(actor: AppUser, input: unknown): Promise<Destinatario[]> {
  requirePermission(actor, PERMISO);
  const { q } = busquedaDestinatariosSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_push_search_recipients", {
    p_actor_id: actor.id,
    p_query: q,
    p_limit: 20,
  });
  if (error) throwPg(error);
  return (
    (data ?? []) as {
      user_id: string;
      display_name: string | null;
      email: string | null;
      roles: string[];
      push_announcements: boolean;
      status: string;
      devices: Destinatario["devices"];
    }[]
  ).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    email: r.email,
    roles: r.roles,
    pushAnnouncements: r.push_announcements,
    status: r.status,
    devices: r.devices,
  }));
}
