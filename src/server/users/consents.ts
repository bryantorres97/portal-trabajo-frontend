import "server-only";

import { getAdminDb } from "@/server/db/admin";
import { throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

export type LegalDocument = { code: string; version: number; title: string; contentMd: string; publishedAt: string };

/** Versiones vigentes (publicadas) de los documentos legales. */
export async function getCurrentLegalDocuments(): Promise<LegalDocument[]> {
  const { data, error } = await getAdminDb()
    .from("current_legal_documents")
    .select("code, version, title, content_md, published_at")
    .order("code")
    .returns<{ code: string; version: number; title: string; content_md: string; published_at: string }[]>();
  if (error) throw error;
  return (data ?? []).map((d) => ({
    code: d.code,
    version: d.version,
    title: d.title,
    contentMd: d.content_md,
    publishedAt: d.published_at,
  }));
}

export async function getLegalDocument(code: string): Promise<LegalDocument | null> {
  return (await getCurrentLegalDocuments()).find((d) => d.code === code) ?? null;
}

/** Documentos vigentes que el usuario aún no aceptó (RN-18). */
export async function getPendingConsents(userId: string): Promise<LegalDocument[]> {
  const [vigentes, { data: aceptados, error }] = await Promise.all([
    getCurrentLegalDocuments(),
    getAdminDb()
      .from("consents")
      .select("document_code, document_version")
      .eq("user_id", userId)
      .returns<{ document_code: string; document_version: number }[]>(),
  ]);
  if (error) throw error;
  const hechos = new Set((aceptados ?? []).map((c) => `${c.document_code}@${c.document_version}`));
  return vigentes.filter((d) => !hechos.has(`${d.code}@${d.version}`));
}

/** Registra la aceptación de todas las versiones vigentes pendientes (atómico, con auditoría). */
export async function acceptCurrentConsents(userId: string, ctx: RequestContext): Promise<number> {
  const { data, error } = await getAdminDb().rpc("fn_accept_current_consents", {
    p_user_id: userId,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as number;
}
