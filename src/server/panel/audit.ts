import "server-only";

import { aCsv } from "@/lib/csv";
import { formatearFechaHora } from "@/lib/formatos";
import { requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { logAudit } from "@/server/audit/log";
import { getAdminDb } from "@/server/db/admin";
import { throwPg } from "@/server/errors";
import type { RequestContext } from "@/server/http/request-info";

/** Visor de la auditoría y de los accesos sensibles (Fase 9, audit.read). */

export type AuditFilters = {
  desde: string;
  hasta: string;
  accion?: string | null;
  recurso?: string | null;
  actor?: string | null;
  recursoId?: string | null;
};

export type AuditRow = {
  id: number;
  occurredAt: string;
  action: string;
  result: string;
  actorName: string | null;
  actorRoles: string[];
  resourceType: string | null;
  resourceId: string | null;
  ip: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
};

export const AUDITORIA_POR_PAGINA = 50;

const limpio = (v: string | null | undefined, max = 80) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

async function buscar(actor: AppUser, f: AuditFilters, limit: number, offset: number) {
  const { data, error } = await getAdminDb().rpc("fn_admin_audit_search", {
    p_actor_id: actor.id,
    p_from: f.desde,
    p_to: f.hasta,
    p_action:
      limpio(f.accion)
        ?.toUpperCase()
        .replace(/[^A-Z_]/g, "") || null,
    p_resource_type: limpio(f.recurso),
    p_actor_q: limpio(f.actor),
    p_resource_id: limpio(f.recursoId, 120),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as {
    id: number;
    occurred_at: string;
    action: string;
    result: string;
    actor_name: string | null;
    actor_roles: string[];
    resource_type: string | null;
    resource_id: string | null;
    ip: string | null;
    request_id: string | null;
    metadata: Record<string, unknown>;
    total: number | string;
  }[];
  return {
    total: filas.length ? Number(filas[0].total) : 0,
    items: filas.map<AuditRow>((r) => ({
      id: Number(r.id),
      occurredAt: r.occurred_at,
      action: r.action,
      result: r.result,
      actorName: r.actor_name,
      actorRoles: r.actor_roles ?? [],
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      ip: r.ip,
      requestId: r.request_id,
      metadata: r.metadata ?? {},
    })),
  };
}

export async function searchAudit(actor: AppUser, f: AuditFilters, pagina = 1) {
  requirePermission(actor, "audit.read");
  const p = Number.isSafeInteger(pagina) && pagina > 0 ? pagina : 1;
  return buscar(actor, f, AUDITORIA_POR_PAGINA, (p - 1) * AUDITORIA_POR_PAGINA);
}

export type SensitiveAccessRow = {
  id: number;
  occurredAt: string;
  actorName: string | null;
  resourceType: string;
  resourceId: string;
  reportId: string;
  justification: string;
};

export async function searchSensitiveAccess(actor: AppUser, f: AuditFilters, pagina = 1) {
  requirePermission(actor, "audit.read");
  const p = Number.isSafeInteger(pagina) && pagina > 0 ? pagina : 1;
  const { data, error } = await getAdminDb().rpc("fn_admin_sensitive_access_search", {
    p_actor_id: actor.id,
    p_from: f.desde,
    p_to: f.hasta,
    p_limit: AUDITORIA_POR_PAGINA,
    p_offset: (p - 1) * AUDITORIA_POR_PAGINA,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as {
    id: number;
    occurred_at: string;
    actor_name: string | null;
    resource_type: string;
    resource_id: string;
    report_id: string;
    justification: string;
    total: number | string;
  }[];
  return {
    total: filas.length ? Number(filas[0].total) : 0,
    items: filas.map<SensitiveAccessRow>((r) => ({
      id: Number(r.id),
      occurredAt: r.occurred_at,
      actorName: r.actor_name,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      reportId: r.report_id,
      justification: r.justification,
    })),
  };
}

/** Exporta la auditoría filtrada (hasta 10 000 filas). Exige data.export y queda auditado. */
export async function exportAudit(actor: AppUser, f: AuditFilters, ctx: RequestContext) {
  requirePermission(actor, "audit.read");
  requirePermission(actor, "data.export");
  const { items } = await buscar(actor, f, 10_000, 0);
  await logAudit({
    action: "DATA_EXPORTED",
    actorId: actor.id,
    actorRoles: actor.roles,
    resourceType: "audit_log",
    resourceId: "auditoria",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    metadata: { ...f, filas: items.length },
  });
  return {
    nombre: `auditoria_${f.desde}_${f.hasta}.csv`,
    csv: aCsv(
      ["Fecha", "Acción", "Resultado", "Actor", "Roles", "Recurso", "Id del recurso", "IP", "Request ID", "Detalle"],
      items.map((r) => [
        formatearFechaHora(r.occurredAt),
        r.action,
        r.result,
        r.actorName,
        r.actorRoles.join(", "),
        r.resourceType,
        r.resourceId,
        r.ip,
        r.requestId,
        JSON.stringify(r.metadata),
      ]),
    ),
  };
}
