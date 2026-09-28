import "server-only";

import { requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { enrollmentUpdateSchema, enrollSchema, trainingSchema } from "@/server/domain/workers/schemas";
import type { WorkerStatus } from "@/server/domain/workers/state-machine";
import { throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

/**
 * Capacitación (P-13 abierta): modelo mínimo de curso + inscripción + resultado. Aprobar exige
 * `training.approve`; el estado del trabajador avanza solo (en proceso → aprobada, o vuelve a
 * pendiente si reprueba o abandona) dentro de la misma transacción.
 */

export type Training = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  provider: "INTERNO" | "EXTERNO";
  validityMonths: number | null;
  required: boolean;
  active: boolean;
};

export async function listTrainings(opts: { onlyActive?: boolean } = {}): Promise<Training[]> {
  let query = getAdminDb()
    .from("trainings")
    .select("id, code, name, description, provider, validity_months, required, active")
    .order("active", { ascending: false })
    .order("name");
  if (opts.onlyActive) query = query.eq("active", true);
  const { data, error } = await query.returns<
    {
      id: string;
      code: string;
      name: string;
      description: string | null;
      provider: "INTERNO" | "EXTERNO";
      validity_months: number | null;
      required: boolean;
      active: boolean;
    }[]
  >();
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, validityMonths: t.validity_months }));
}

export async function saveTraining(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requirePermission(actor, "training.manage");
  const d = trainingSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_save_training", {
    p_actor_id: actor.id,
    p_id: d.id ?? null,
    p_code: d.code,
    p_name: d.name,
    p_description: d.description ?? null,
    p_provider: d.provider,
    p_validity_months: d.validityMonths ?? null,
    p_required: d.required,
    p_active: d.active,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export async function enrollWorker(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requirePermission(actor, "training.record");
  const d = enrollSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_enroll_worker", {
    p_actor_id: actor.id,
    p_worker_id: d.workerId,
    p_training_id: d.trainingId,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export async function updateEnrollment(actor: AppUser, input: unknown, ctx: RequestContext) {
  const d = enrollmentUpdateSchema.parse(input);
  requirePermission(actor, d.status === "APROBADO" ? "training.approve" : "training.record");
  const { error } = await getAdminDb().rpc("fn_admin_update_enrollment", {
    p_actor_id: actor.id,
    p_enrollment_id: d.enrollmentId,
    p_status: d.status,
    p_score: d.score ?? null,
    p_note: d.note ?? null,
    p_evidence_document_id: d.evidenceDocumentId ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return d.status;
}

export type TrainingQueueItem = { id: string; displayName: string; status: WorkerStatus; statusChangedAt: string };

/** Bandeja del responsable de capacitación: trabajadores por inscribir o en curso. */
export async function trainingQueue(actor: AppUser): Promise<TrainingQueueItem[]> {
  requirePermission(actor, "training.record");
  const { data, error } = await getAdminDb()
    .from("worker_profiles")
    .select("id, public_display_name, status, status_changed_at")
    .in("status", ["CAPACITACION_PENDIENTE", "CAPACITACION_EN_PROCESO"])
    .order("status_changed_at", { ascending: true })
    .limit(100)
    .returns<{ id: string; public_display_name: string; status: WorkerStatus; status_changed_at: string }[]>();
  if (error) throw error;
  return (data ?? []).map((w) => ({
    id: w.id,
    displayName: w.public_display_name,
    status: w.status,
    statusChangedAt: w.status_changed_at,
  }));
}
