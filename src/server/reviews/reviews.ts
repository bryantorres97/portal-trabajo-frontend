import "server-only";

import { z } from "zod";

import { requirePermission, requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import {
  FILTROS_MODERACION,
  hideReviewSchema,
  reportReviewSchema,
  reviewSchema,
  type FiltroModeracion,
} from "@/server/domain/reviews/schemas";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

/**
 * Calificaciones (Fase 7, ADR-011). La reseña del cliente al trabajador es pública; la del trabajador
 * al cliente solo la ven trabajadores (en su conversación o contratación) y el personal del GAD (RN-20).
 * Las reglas viven en las funciones SQL de reseñas; aquí solo se valida y se adapta.
 */

export type ReviewDirection = "CLIENTE_A_TRABAJADOR" | "TRABAJADOR_A_CLIENTE";

export type ContractReview = {
  id: string;
  direction: ReviewDirection;
  rating: number;
  comment: string | null;
  status: "PUBLICADA" | "OCULTA";
  isMine: boolean;
  createdAt: string;
  editedAt: string | null;
  editableUntil: string;
  canEdit: boolean;
};

export type ContractReviews = {
  canCreate: boolean;
  windowEndsAt: string | null;
  mine: ContractReview | null;
  /** La calificación que recibí (null si no existe o si no puedo verla, RN-20). */
  theirs: ContractReview | null;
};

const uuid = (id: string, mensaje: string) => {
  if (!z.uuid().safeParse(id).success) throw new DomainError(404, mensaje);
  return id;
};

export async function getContractReviews(user: AppUser, contractId: string): Promise<ContractReviews> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_contract_reviews", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId, "Contratación no encontrada"),
  });
  if (error) throwPg(error);
  return data as ContractReviews;
}

/** Crea o edita (dentro de los 7 días) la calificación sobre la otra parte. */
export async function saveReview(
  user: AppUser,
  contractId: string,
  input: unknown,
  ctx: RequestContext,
): Promise<string> {
  requireUser(user);
  const d = reviewSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_review_save", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId, "Contratación no encontrada"),
    p_rating: d.rating,
    p_comment: d.comment ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  authorName: string;
  serviceName: string | null;
  createdAt: string;
  edited: boolean;
};

export const RESENAS_POR_PAGINA = 10;

/** Reseñas públicas de un trabajador habilitado (las más recientes primero). */
export async function listPublicWorkerReviews(
  workerId: string,
  page = 1,
): Promise<{ items: PublicReview[]; total: number; hasMore: boolean }> {
  if (!z.uuid().safeParse(workerId).success) return { items: [], total: 0, hasMore: false };
  const pagina = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
  const { data, error } = await getAdminDb().rpc("fn_public_worker_reviews", {
    p_worker_id: workerId,
    p_limit: RESENAS_POR_PAGINA,
    p_offset: (pagina - 1) * RESENAS_POR_PAGINA,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as {
    id: string;
    rating: number;
    comment: string | null;
    author_name: string;
    service_name: string | null;
    created_at: string;
    edited: boolean;
    total: number | string;
  }[];
  const total = filas.length ? Number(filas[0].total) : 0;
  return {
    items: filas.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      authorName: r.author_name,
      serviceName: r.service_name,
      createdAt: r.created_at,
      edited: r.edited,
    })),
    total,
    hasMore: pagina * RESENAS_POR_PAGINA < total,
  };
}

export type ClientReputation = {
  average: number;
  count: number;
  contractsCompleted: number;
  recent: { rating: number; comment: string | null; createdAt: string; authorName: string }[];
};

/**
 * Reputación del cliente de una conversación, para el trabajador de esa conversación (RN-20).
 * Devuelve null si el usuario no puede verla (no es el trabajador o no tiene el rol activo).
 */
export async function getClientReputation(user: AppUser, conversationId: string): Promise<ClientReputation | null> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_client_reputation", {
    p_user_id: user.id,
    p_conversation_id: uuid(conversationId, "Conversación no encontrada"),
  });
  if (error) {
    if (error.code === "42501" || error.code === "P0002") return null;
    throwPg(error);
  }
  const r = data as ClientReputation;
  return { ...r, average: Number(r.average), count: Number(r.count), contractsCompleted: Number(r.contractsCompleted) };
}

export type ReviewReason = { code: string; label: string };

export async function listReviewReportReasons(): Promise<ReviewReason[]> {
  const { data, error } = await getAdminDb()
    .from("report_reasons")
    .select("code, label")
    .eq("target_type", "REVIEW")
    .eq("active", true)
    .order("sort_order")
    .returns<ReviewReason[]>();
  if (error) throw error;
  return data ?? [];
}

export async function reportReview(user: AppUser, reviewId: string, input: unknown, ctx: RequestContext) {
  requireUser(user);
  const d = reportReviewSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_report_review", {
    p_user_id: user.id,
    p_review_id: uuid(reviewId, "Calificación no encontrada"),
    p_reason_code: d.reasonCode,
    p_description: d.description ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

// -----------------------------------------------------------------------------
// Moderación (moderation.act)
// -----------------------------------------------------------------------------

export type ModerationReview = {
  id: string;
  direction: ReviewDirection;
  rating: number;
  comment: string | null;
  status: "PUBLICADA" | "OCULTA";
  authorName: string;
  subjectName: string;
  workerId: string;
  contractId: string;
  createdAt: string;
  editedAt: string | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
  openReports: number;
  reportReasons: string[];
};

export const RESENAS_MODERACION_POR_PAGINA = 25;

export async function listReviewsForModeration(
  actor: AppUser,
  filtro: string | undefined,
  page = 1,
): Promise<{ items: ModerationReview[]; total: number; filtro: FiltroModeracion }> {
  requirePermission(actor, "moderation.act");
  const f = (FILTROS_MODERACION as readonly string[]).includes(filtro ?? "")
    ? (filtro as FiltroModeracion)
    : "denunciadas";
  const pagina = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const { data, error } = await getAdminDb().rpc("fn_admin_list_reviews", {
    p_actor_id: actor.id,
    p_filter: f.toUpperCase(),
    p_limit: RESENAS_MODERACION_POR_PAGINA,
    p_offset: (pagina - 1) * RESENAS_MODERACION_POR_PAGINA,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as {
    id: string;
    direction: ReviewDirection;
    rating: number;
    comment: string | null;
    status: "PUBLICADA" | "OCULTA";
    author_name: string | null;
    subject_name: string | null;
    worker_id: string;
    contract_id: string;
    created_at: string;
    edited_at: string | null;
    hidden_at: string | null;
    hidden_reason: string | null;
    open_reports: number | string;
    report_reasons: string[];
    total: number | string;
  }[];
  return {
    filtro: f,
    total: filas.length ? Number(filas[0].total) : 0,
    items: filas.map((r) => ({
      id: r.id,
      direction: r.direction,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      authorName: r.author_name ?? "Usuario",
      subjectName: r.subject_name ?? "Usuario",
      workerId: r.worker_id,
      contractId: r.contract_id,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      hiddenAt: r.hidden_at,
      hiddenReason: r.hidden_reason,
      openReports: Number(r.open_reports),
      reportReasons: r.report_reasons ?? [],
    })),
  };
}

export async function setReviewHidden(actor: AppUser, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "moderation.act");
  const d = hideReviewSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_set_review_hidden", {
    p_actor_id: actor.id,
    p_review_id: d.reviewId,
    p_hidden: d.hidden,
    p_reason: d.reason,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as "PUBLICADA" | "OCULTA";
}
