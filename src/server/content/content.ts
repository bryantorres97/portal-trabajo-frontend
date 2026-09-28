import "server-only";

import { z } from "zod";

import { requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { faqSchema, legalDraftSchema, legalPublishSchema } from "@/server/domain/panel/schemas";
import { throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

/**
 * Contenido administrable (Fase 9, content.manage): preguntas frecuentes y documentos legales
 * versionados. Publicar una versión legal obliga a todos a aceptarla de nuevo (RN-18).
 */

export type Audiencia = "GENERAL" | "CLIENTES" | "TRABAJADORES";
export type PublicFaq = { id: string; audience: Audiencia; question: string; answerMd: string };

export async function listPublicFaq(): Promise<PublicFaq[]> {
  const { data, error } = await getAdminDb().rpc("fn_public_faq");
  if (error) throwPg(error);
  return ((data ?? []) as { id: string; audience: Audiencia; question: string; answer_md: string }[]).map((f) => ({
    id: f.id,
    audience: f.audience,
    question: f.question,
    answerMd: f.answer_md,
  }));
}

export type AdminFaq = PublicFaq & { sortOrder: number; published: boolean; updatedAt: string };

export async function listFaqForAdmin(actor: AppUser): Promise<AdminFaq[]> {
  requirePermission(actor, "content.manage");
  const { data, error } = await getAdminDb()
    .from("faq_items")
    .select("id, audience, question, answer_md, sort_order, published, updated_at")
    .order("sort_order")
    .order("question")
    .returns<
      {
        id: string;
        audience: Audiencia;
        question: string;
        answer_md: string;
        sort_order: number;
        published: boolean;
        updated_at: string;
      }[]
    >();
  if (error) throw error;
  return (data ?? []).map((f) => ({
    id: f.id,
    audience: f.audience,
    question: f.question,
    answerMd: f.answer_md,
    sortOrder: f.sort_order,
    published: f.published,
    updatedAt: f.updated_at,
  }));
}

export async function saveFaq(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requirePermission(actor, "content.manage");
  const d = faqSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_save_faq", {
    p_actor_id: actor.id,
    p_id: d.id ?? null,
    p_audience: d.audience,
    p_question: d.question,
    p_answer_md: d.answerMd,
    p_sort_order: d.sortOrder,
    p_published: d.published,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export async function deleteFaq(actor: AppUser, id: string, ctx: RequestContext): Promise<void> {
  requirePermission(actor, "content.manage");
  const { error } = await getAdminDb().rpc("fn_admin_delete_faq", {
    p_actor_id: actor.id,
    p_id: z.uuid().parse(id),
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

export type LegalVersion = {
  code: "TERMINOS" | "PRIVACIDAD";
  version: number;
  title: string;
  contentMd: string;
  publishedAt: string | null;
  createdAt: string;
  acceptances: number;
};

export async function listLegalForAdmin(actor: AppUser): Promise<LegalVersion[]> {
  requirePermission(actor, "content.manage");
  const { data, error } = await getAdminDb().rpc("fn_admin_legal_documents", { p_actor_id: actor.id });
  if (error) throwPg(error);
  return (
    (data ?? []) as {
      code: LegalVersion["code"];
      version: number;
      title: string;
      content_md: string;
      published_at: string | null;
      created_at: string;
      acceptances: number | string;
    }[]
  ).map((d) => ({
    code: d.code,
    version: d.version,
    title: d.title,
    contentMd: d.content_md,
    publishedAt: d.published_at,
    createdAt: d.created_at,
    acceptances: Number(d.acceptances),
  }));
}

export async function saveLegalDraft(actor: AppUser, input: unknown, ctx: RequestContext): Promise<number> {
  requirePermission(actor, "content.manage");
  const d = legalDraftSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_save_legal_draft", {
    p_actor_id: actor.id,
    p_code: d.code,
    p_title: d.title,
    p_content_md: d.contentMd,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return Number(data);
}

export async function publishLegal(actor: AppUser, input: unknown, ctx: RequestContext): Promise<void> {
  requirePermission(actor, "content.manage");
  const d = legalPublishSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_admin_publish_legal", {
    p_actor_id: actor.id,
    p_code: d.code,
    p_version: d.version,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

export async function discardLegalDraft(actor: AppUser, code: string): Promise<void> {
  requirePermission(actor, "content.manage");
  const { error } = await getAdminDb().rpc("fn_admin_discard_legal_draft", {
    p_actor_id: actor.id,
    p_code: legalPublishSchema.shape.code.parse(code),
  });
  if (error) throwPg(error);
}
