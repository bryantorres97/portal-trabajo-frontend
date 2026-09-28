import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { DOCUMENT_TYPES, EXTENSION, safeOriginalName } from "@/server/domain/documents/files";
import { createReportSchema, evidenceNoteSchema } from "@/server/domain/reports/schemas";
import type { ReportStatus, ReportTargetType } from "@/server/domain/reports/state-machine";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";
import { EVIDENCE_BUCKET, readUpload, removeObject, uploadObject } from "@/server/storage/files";

/**
 * Denuncias del lado ciudadano (Fase 8): crear (perfil, cliente o conversación), seguir su estado y
 * aportar información o archivos. Mensajes, reseñas y disputas se denuncian desde sus módulos;
 * todas pasan por el mismo límite diario, prioridad e historial (triggers de `reports`).
 */

export type ReportReason = { code: string; label: string };

export async function listReportReasons(targetType: ReportTargetType): Promise<ReportReason[]> {
  const { data, error } = await getAdminDb()
    .from("report_reasons")
    .select("code, label")
    .eq("target_type", targetType)
    .eq("active", true)
    .order("sort_order")
    .returns<ReportReason[]>();
  if (error) throw error;
  return data ?? [];
}

export async function createReport(user: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requireUser(user);
  const d = createReportSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_report_create", {
    p_user_id: user.id,
    p_target_type: d.targetType,
    p_target_id: d.targetId,
    p_reason_code: d.reasonCode,
    p_description: d.description,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export type MyReportSummary = {
  id: string;
  targetType: ReportTargetType;
  targetLabel: string;
  reasonLabel: string;
  status: ReportStatus;
  publicMessage: string;
  needsInfo: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listMyReports(user: AppUser): Promise<MyReportSummary[]> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_my_reports", { p_user_id: user.id });
  if (error) throwPg(error);
  return (
    (data ?? []) as {
      id: string;
      target_type: ReportTargetType;
      target_label: string;
      reason_label: string;
      status: ReportStatus;
      public_message: string;
      needs_info: boolean;
      created_at: string;
      updated_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetLabel: r.target_label,
    reasonLabel: r.reason_label,
    status: r.status,
    publicMessage: r.public_message,
    needsInfo: r.needs_info,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export type MyReport = {
  id: string;
  targetType: ReportTargetType;
  targetLabel: string;
  reasonLabel: string;
  description: string | null;
  status: ReportStatus;
  publicMessage: string;
  open: boolean;
  needsInfo: boolean;
  createdAt: string;
  resolvedAt: string | null;
  events: {
    id: number;
    event: string;
    toStatus: ReportStatus | null;
    note: string | null;
    byMe: boolean;
    createdAt: string;
  }[];
  evidence: { id: string; kind: "FILE" | "NOTE"; name: string | null; note: string | null; createdAt: string }[];
};

const uuid = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new DomainError(404, "Denuncia no encontrada");
  return id;
};

export async function getMyReport(user: AppUser, reportId: string): Promise<MyReport> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_my_report", { p_user_id: user.id, p_report_id: uuid(reportId) });
  if (error) throwPg(error);
  return data as MyReport;
}

/** El denunciante aporta información (si el GAD la pidió, la denuncia vuelve a revisión). */
export async function addReportNote(user: AppUser, reportId: string, input: unknown): Promise<string> {
  requireUser(user);
  const { note } = evidenceNoteSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_report_add_evidence", {
    p_user_id: user.id,
    p_report_id: uuid(reportId),
    p_note: note,
  });
  if (error) throwPg(error);
  return data as string;
}

/** Adjunta un archivo (PDF o imagen, 4 MB, firma binaria verificada) al bucket privado de evidencia. */
export async function addReportFile(
  user: AppUser,
  reportId: string,
  value: FormDataEntryValue | null,
): Promise<string> {
  requireUser(user);
  const file = await readUpload(value, DOCUMENT_TYPES);
  const path = `reports/${uuid(reportId)}/${randomUUID()}.${EXTENSION[file.kind]}`;
  await uploadObject(path, file, EVIDENCE_BUCKET);
  const { data, error } = await getAdminDb().rpc("fn_report_add_evidence", {
    p_user_id: user.id,
    p_report_id: reportId,
    p_storage_path: path,
    p_mime_type: file.kind,
    p_size_bytes: file.size,
    p_sha256: file.sha256,
    p_original_name: safeOriginalName(file.name),
  });
  if (error) {
    await removeObject(path, EVIDENCE_BUCKET);
    throwPg(error);
  }
  return data as string;
}
