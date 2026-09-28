import "server-only";

import { z } from "zod";

import { requirePermission } from "@/server/auth/authorize";
import { revokeEncryptedTokens } from "@/server/auth/session";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import {
  accessEvidenceSchema,
  disputeResolutionSchema,
  finDelDiaEcuador,
  liftSchema,
  moderationSchema,
  reportUpdateSchema,
} from "@/server/domain/reports/schemas";
import {
  esTemporal,
  permisoAccion,
  VISTAS,
  type AccionModeracion,
  type ReportStatus,
  type ReportTargetType,
  type Resolucion,
  type VistaBandeja,
} from "@/server/domain/reports/state-machine";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, toInet, type RequestContext } from "@/server/http/request-info";
import { EVIDENCE_BUCKET, signedUrl } from "@/server/storage/files";

/**
 * Denuncias del lado del GAD (Fase 8). Consultar: report.read. Gestionar: report.manage. Evidencia y
 * conversación: report.evidence.read + justificación (RN-09, sensitive_access_log). Advertir u ocultar:
 * moderation.act. Suspender o bloquear: report.manage.
 */

export type ReportListItem = {
  id: string;
  targetType: ReportTargetType;
  targetLabel: string;
  reasonLabel: string;
  status: ReportStatus;
  priority: 1 | 2 | 3;
  assignedTo: string | null;
  assignedName: string | null;
  reporterName: string | null;
  reportedName: string | null;
  createdAt: string;
  dueAt: string | null;
  overdue: boolean;
};

export const DENUNCIAS_POR_PAGINA = 25;

export async function listReports(
  actor: AppUser,
  vista: string | undefined,
  page = 1,
): Promise<{ items: ReportListItem[]; total: number; vista: VistaBandeja }> {
  requirePermission(actor, "report.read");
  const v = (VISTAS as readonly string[]).includes(vista ?? "") ? (vista as VistaBandeja) : "por_atender";
  const pagina = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const { data, error } = await getAdminDb().rpc("fn_admin_list_reports", {
    p_actor_id: actor.id,
    p_view: v.toUpperCase(),
    p_limit: DENUNCIAS_POR_PAGINA,
    p_offset: (pagina - 1) * DENUNCIAS_POR_PAGINA,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as {
    id: string;
    target_type: ReportTargetType;
    target_label: string;
    reason_label: string;
    status: ReportStatus;
    priority: 1 | 2 | 3;
    assigned_to: string | null;
    assigned_name: string | null;
    reporter_name: string | null;
    reported_name: string | null;
    created_at: string;
    due_at: string | null;
    overdue: boolean;
    total: number | string;
  }[];
  return {
    vista: v,
    total: filas.length ? Number(filas[0].total) : 0,
    items: filas.map((r) => ({
      id: r.id,
      targetType: r.target_type,
      targetLabel: r.target_label,
      reasonLabel: r.reason_label,
      status: r.status,
      priority: r.priority,
      assignedTo: r.assigned_to,
      assignedName: r.assigned_name,
      reporterName: r.reporter_name,
      reportedName: r.reported_name,
      createdAt: r.created_at,
      dueAt: r.due_at,
      overdue: r.overdue,
    })),
  };
}

export type ReportsSummary = {
  porAtender: number;
  sinAsignar: number;
  mias: number;
  vencidas: number;
  escaladas: number;
  altaPrioridad: number;
};

export async function reportsSummary(actor: AppUser): Promise<ReportsSummary> {
  requirePermission(actor, "report.read");
  const { data, error } = await getAdminDb().rpc("fn_admin_reports_summary", { p_actor_id: actor.id });
  if (error) throwPg(error);
  return data as ReportsSummary;
}

type Persona = { id: string; name: string | null; status: string };

export type ReportDetail = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  reasonCode: string;
  reasonLabel: string;
  description: string | null;
  status: ReportStatus;
  priority: 1 | 2 | 3;
  dueAt: string | null;
  overdue: boolean;
  assignedTo: string | null;
  assignedName: string | null;
  resolution: Resolucion | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  hasConversation: boolean;
  contractId: string | null;
  contractStatus: string | null;
  reporter: (Persona & { reportsMade: number }) | null;
  reported: (Persona & { isStaff: boolean; reportsReceived: number; actionsReceived: number }) | null;
  worker: { id: string; name: string; status: string; suspendedUntil: string | null } | null;
  review: { id: string; rating: number; comment: string | null; status: string; direction: string } | null;
  messageHidden: boolean | null;
  relatedOpen: number;
  evidenceCount: number;
  events: {
    id: number;
    event: string;
    fromStatus: ReportStatus | null;
    toStatus: ReportStatus | null;
    note: string | null;
    visibleToReporter: boolean;
    actorName: string | null;
    byReporter: boolean;
    createdAt: string;
  }[];
  actions: {
    id: string;
    action: AccionModeracion;
    reason: string;
    startsAt: string;
    endsAt: string | null;
    liftedAt: string | null;
    liftReason: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
  accesses: { actorName: string | null; resourceType: string; justification: string; occurredAt: string }[];
  evidenceUnlockedUntil: string | null;
};

const uuid = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new DomainError(404, "Denuncia no encontrada");
  return id;
};

export async function getReport(actor: AppUser, reportId: string): Promise<ReportDetail> {
  requirePermission(actor, "report.read");
  const { data, error } = await getAdminDb().rpc("fn_admin_get_report", {
    p_actor_id: actor.id,
    p_report_id: uuid(reportId),
  });
  if (error) throwPg(error);
  return data as ReportDetail;
}

export async function updateReport(actor: AppUser, input: unknown, ctx: RequestContext): Promise<ReportStatus> {
  requirePermission(actor, "report.manage");
  const d = reportUpdateSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_report_update", {
    p_actor_id: actor.id,
    p_report_id: d.reportId,
    p_op: d.op,
    p_note: d.note ?? null,
    p_resolution: d.resolution ?? null,
    p_priority: d.priority ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as ReportStatus;
}

export type EvidenceView = {
  focusMessageId: number | null;
  conversation: {
    clientName: string | null;
    workerName: string;
    messages: {
      id: number;
      senderRole: "CLIENTE" | "TRABAJADOR" | "SISTEMA";
      kind: "TEXT" | "SYSTEM";
      body: string;
      hidden: boolean;
      createdAt: string;
    }[];
  } | null;
  contract: {
    status: string;
    versions: {
      version: number;
      proposerRole: string;
      description: string;
      scheduledStart: string;
      priceAmount: number;
      priceUnit: string;
      conditions: string | null;
      agreed: boolean;
      createdAt: string;
    }[];
    events: { event: string; createdAt: string }[];
  } | null;
  evidence: {
    id: string;
    kind: "FILE" | "NOTE";
    name: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    note: string | null;
    createdAt: string;
  }[];
};

/** RN-09: cada llamada registra el acceso con su justificación (sensitive_access_log + auditoría). */
export async function accessReportEvidence(actor: AppUser, input: unknown, ctx: RequestContext): Promise<EvidenceView> {
  requirePermission(actor, "report.evidence.read");
  const d = accessEvidenceSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_access_report_evidence", {
    p_actor_id: actor.id,
    p_report_id: d.reportId,
    p_justification: d.justification,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as EvidenceView;
}

/** URL firmada de 5 min de un archivo de evidencia, solo dentro del acceso justificado vigente. */
export async function evidenceFileUrl(
  actor: AppUser,
  reportId: string,
  evidenceId: string,
  ctx: RequestContext,
): Promise<string> {
  requirePermission(actor, "report.evidence.read");
  const { data, error } = await getAdminDb()
    .rpc("fn_admin_evidence_file", {
      p_actor_id: actor.id,
      p_report_id: uuid(reportId),
      p_evidence_id: uuid(evidenceId),
      p_ip: toInet(ctx.ip),
      p_request_id: ctx.requestId,
    })
    .single<{ storage_path: string }>();
  if (error) throwPg(error);
  return signedUrl(data.storage_path, undefined, EVIDENCE_BUCKET);
}

export async function applyModeration(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  const d = moderationSchema.parse(input);
  requirePermission(actor, permisoAccion(d.action));
  if (esTemporal(d.action) && !d.endsOn) throw new DomainError(422, "Indica hasta qué fecha dura la suspensión");
  const { data, error } = await getAdminDb().rpc("fn_admin_apply_moderation", {
    p_actor_id: actor.id,
    p_report_id: d.reportId,
    p_action: d.action,
    p_reason: d.reason,
    p_ends_at: esTemporal(d.action) && d.endsOn ? finDelDiaEcuador(d.endsOn) : null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  const r = data as { id: string; revokedTokens: string[] };
  // Cuenta suspendida o bloqueada: también se revocan sus refresh tokens en Cognito.
  if (r.revokedTokens?.length) await revokeEncryptedTokens(r.revokedTokens);
  return r.id;
}

export async function liftModeration(actor: AppUser, input: unknown, ctx: RequestContext): Promise<boolean> {
  requirePermission(actor, "admin.access");
  const d = liftSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_lift_moderation", {
    p_actor_id: actor.id,
    p_action_id: d.actionId,
    p_reason: d.reason,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as boolean;
}

/** Resolución de una disputa de contratación desde su denuncia (finalizar o cancelar). */
export async function resolveContractDispute(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requirePermission(actor, "report.manage");
  const d = disputeResolutionSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_resolve_contract_dispute", {
    p_actor_id: actor.id,
    p_contract_id: d.contractId,
    p_outcome: d.outcome,
    p_note: d.note,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

/** Tarea programada (respaldo de pg_cron): levanta las sanciones vencidas. */
export async function runModerationMaintenance(): Promise<number> {
  const { data, error } = await getAdminDb().rpc("fn_run_moderation_maintenance", {});
  if (error) throwPg(error);
  return Number(data);
}
