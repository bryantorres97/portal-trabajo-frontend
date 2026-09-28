import "server-only";

import { requirePermission, requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { PHOTO_TYPES, photoPath } from "@/server/domain/documents/files";
import { availabilitySchema, profileProposalSchema, reviewDecisionSchema } from "@/server/domain/workers/schemas";
import type { WorkerStatus } from "@/server/domain/workers/state-machine";
import { throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";
import { downloadObject, readUpload, removeObject, uploadObject } from "@/server/storage/files";

/**
 * Perfil público del trabajador: edición limitada por el propio trabajador (disponibilidad directa;
 * biografía, nota y foto quedan PENDIENTES) y moderación del GAD (`worker.update`).
 */

export type OwnWorker = {
  id: string;
  displayName: string;
  specialty: string | null;
  status: WorkerStatus;
  isAvailable: boolean;
  publicBio: string | null;
  availabilityNote: string | null;
  services: string[];
  parish: string | null;
  photo: { hasApproved: boolean; hasPending: boolean; status: string; reviewNote: string | null };
  proposal: { bio: string | null; availabilityNote: string | null; submittedAt: string } | null;
  proposalReviewNote: string | null;
};

/** Ficha del trabajador vinculado a la cuenta (sin datos que no le correspondan ver), o null. */
export async function getOwnWorker(userId: string): Promise<OwnWorker | null> {
  const { data: w, error } = await getAdminDb()
    .from("worker_profiles")
    .select(
      "id, public_display_name, specialty, status, is_available, public_bio, availability_note, photo_path, photo_pending_path, photo_status, photo_review_note, proposed_bio, proposed_availability_note, proposal_submitted_at, proposal_review_note, parishes(name), worker_services(is_primary, services(name))",
    )
    .eq("user_id", userId)
    .maybeSingle<{
      id: string;
      public_display_name: string;
      specialty: string | null;
      status: WorkerStatus;
      is_available: boolean;
      public_bio: string | null;
      availability_note: string | null;
      photo_path: string | null;
      photo_pending_path: string | null;
      photo_status: string;
      photo_review_note: string | null;
      proposed_bio: string | null;
      proposed_availability_note: string | null;
      proposal_submitted_at: string | null;
      proposal_review_note: string | null;
      parishes: { name: string } | null;
      worker_services: { is_primary: boolean; services: { name: string } | null }[];
    }>();
  if (error) throw error;
  if (!w) return null;
  return {
    id: w.id,
    displayName: w.public_display_name,
    specialty: w.specialty,
    status: w.status,
    isAvailable: w.is_available,
    publicBio: w.public_bio,
    availabilityNote: w.availability_note,
    parish: w.parishes?.name ?? null,
    services: [...w.worker_services]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((s) => s.services?.name ?? "")
      .filter(Boolean),
    photo: {
      hasApproved: !!w.photo_path,
      hasPending: !!w.photo_pending_path && w.photo_status === "PENDIENTE",
      status: w.photo_status,
      reviewNote: w.photo_review_note,
    },
    proposal: w.proposal_submitted_at
      ? { bio: w.proposed_bio, availabilityNote: w.proposed_availability_note, submittedAt: w.proposal_submitted_at }
      : null,
    proposalReviewNote: w.proposal_review_note,
  };
}

export async function setOwnAvailability(user: AppUser, input: unknown, ctx: RequestContext) {
  requireUser(user);
  const { isAvailable } = availabilitySchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_worker_set_availability", {
    p_user_id: user.id,
    p_available: isAvailable,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return isAvailable;
}

export async function proposeOwnProfile(user: AppUser, input: unknown, ctx: RequestContext) {
  requireUser(user);
  const d = profileProposalSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_worker_propose_profile", {
    p_user_id: user.id,
    p_bio: d.publicBio ?? null,
    p_availability_note: d.availabilityNote ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

export async function proposeOwnPhoto(user: AppUser, file: FormDataEntryValue | null, ctx: RequestContext) {
  requireUser(user);
  const own = await getOwnWorker(user.id);
  const archivo = await readUpload(file, PHOTO_TYPES);
  // Sin ficha, la función SQL rechaza el cambio; se sube solo si existe para no dejar huérfanos.
  if (!own) throwPg({ code: "42501", message: "No tienes una ficha de trabajador activa" });
  const ruta = photoPath(own.id, crypto.randomUUID(), archivo.kind);
  await uploadObject(ruta, archivo);
  const { error } = await getAdminDb().rpc("fn_worker_propose_photo", {
    p_user_id: user.id,
    p_path: ruta,
    ...auditParams(ctx),
  });
  if (error) {
    await removeObject(ruta).catch(() => undefined);
    throwPg(error);
  }
}

/** Foto tomada por el personal en la atención presencial: queda aprobada. */
export async function setWorkerPhoto(
  actor: AppUser,
  workerId: string,
  file: FormDataEntryValue | null,
  ctx: RequestContext,
) {
  requirePermission(actor, "worker.update");
  const archivo = await readUpload(file, PHOTO_TYPES);
  const ruta = photoPath(workerId, crypto.randomUUID(), archivo.kind);
  await uploadObject(ruta, archivo);
  const { error } = await getAdminDb().rpc("fn_admin_set_worker_photo", {
    p_actor_id: actor.id,
    p_worker_id: workerId,
    p_path: ruta,
    ...auditParams(ctx),
  });
  if (error) {
    await removeObject(ruta).catch(() => undefined);
    throwPg(error);
  }
}

export async function reviewWorkerPhoto(actor: AppUser, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "worker.update");
  const d = reviewDecisionSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_admin_review_worker_photo", {
    p_actor_id: actor.id,
    p_worker_id: d.workerId,
    p_approve: d.decision === "APROBAR",
    p_note: d.note ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return d.decision;
}

export async function reviewWorkerProfile(actor: AppUser, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "worker.update");
  const d = reviewDecisionSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_admin_review_worker_profile", {
    p_actor_id: actor.id,
    p_worker_id: d.workerId,
    p_approve: d.decision === "APROBAR",
    p_note: d.note ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return d.decision;
}

type PhotoVariant = "approved" | "pending";

/** Bytes de la foto de un trabajador (la autorización la hace quien llama). */
export async function readWorkerPhoto(workerId: string, variant: PhotoVariant) {
  const { data, error } = await getAdminDb()
    .from("worker_profiles")
    .select("photo_path, photo_pending_path")
    .eq("id", workerId)
    .maybeSingle<{ photo_path: string | null; photo_pending_path: string | null }>();
  if (error) throw error;
  const ruta = variant === "approved" ? data?.photo_path : data?.photo_pending_path;
  return ruta ? downloadObject(ruta) : null;
}

/** Foto pública: solo de trabajadores HABILITADOS con foto aprobada. */
export async function readPublicWorkerPhoto(workerId: string) {
  const { data, error } = await getAdminDb().rpc("fn_public_worker_photo_path", { p_id: workerId });
  if (error) throw error;
  return typeof data === "string" && data ? downloadObject(data) : null;
}
