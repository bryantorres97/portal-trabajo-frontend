import "server-only";

import { logAudit } from "@/server/audit/log";
import { AuthError, hasPermission, requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { DOCUMENT_TYPES, documentPath, safeOriginalName } from "@/server/domain/documents/files";
import { documentReviewSchema, documentUploadSchema } from "@/server/domain/workers/schemas";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";
import { readUpload, removeObject, signedUrl, uploadObject } from "@/server/storage/files";

/**
 * Documentos del trabajador (dato SENSIBLE, 04-modelo-datos.md §7): bucket privado, URL firmada
 * de 5 minutos y auditoría de cada acceso. Nunca se borran: se reemplazan.
 */

export type DocumentType = {
  code: string;
  name: string;
  description: string | null;
  required: boolean;
  hasExpiry: boolean;
};

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const { data, error } = await getAdminDb()
    .from("document_types")
    .select("code, name, description, required, has_expiry")
    .eq("active", true)
    .order("sort_order")
    .returns<{ code: string; name: string; description: string | null; required: boolean; has_expiry: boolean }[]>();
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, hasExpiry: t.has_expiry }));
}

/** Sube el archivo (validado por su firma binaria) y lo registra; si el registro falla, lo borra. */
export async function uploadDocument(actor: AppUser, formData: FormData, ctx: RequestContext): Promise<string> {
  requirePermission(actor, "document.upload");
  const d = documentUploadSchema.parse({
    workerId: formData.get("workerId"),
    typeCode: formData.get("typeCode"),
    issuedAt: formData.get("issuedAt") ?? undefined,
    expiresAt: formData.get("expiresAt") ?? undefined,
    replacesId: formData.get("replacesId") ?? undefined,
  });
  const archivo = await readUpload(formData.get("file"), DOCUMENT_TYPES);
  const ruta = documentPath(d.workerId, crypto.randomUUID(), archivo.kind);

  await uploadObject(ruta, archivo);
  const { data, error } = await getAdminDb().rpc("fn_admin_register_document", {
    p_actor_id: actor.id,
    p_worker_id: d.workerId,
    p_type_code: d.typeCode,
    p_storage_path: ruta,
    p_original_name: safeOriginalName(archivo.name),
    p_mime_type: archivo.kind,
    p_size_bytes: archivo.size,
    p_sha256: archivo.sha256,
    p_issued_at: d.issuedAt ?? null,
    p_expires_at: d.expiresAt ?? null,
    p_replaces_id: d.replacesId ?? null,
    ...auditParams(ctx),
  });
  if (error) {
    await removeObject(ruta).catch(() => undefined);
    throwPg(error);
  }
  return data as string;
}

export async function reviewDocument(actor: AppUser, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "document.review");
  const d = documentReviewSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_admin_review_document", {
    p_actor_id: actor.id,
    p_document_id: d.documentId,
    p_status: d.status,
    p_note: d.note ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return d.status;
}

/** Puede abrir el archivo: `document.read`, o `document.upload` si lo subió él (operador). */
export function canOpenDocument(actor: AppUser, uploadedByActor: boolean): boolean {
  return hasPermission(actor, "document.read") || (hasPermission(actor, "document.upload") && uploadedByActor);
}

/** URL firmada (5 min) para ver un documento. Cada acceso queda auditado; los denegados también. */
export async function documentAccessUrl(
  actor: AppUser,
  workerId: string,
  documentId: string,
  ctx: RequestContext,
): Promise<string> {
  const { data: doc, error } = await getAdminDb()
    .from("worker_documents")
    .select("id, worker_id, storage_path, uploaded_by, type_code")
    .eq("id", documentId)
    .eq("worker_id", workerId)
    .maybeSingle<{ id: string; worker_id: string; storage_path: string; uploaded_by: string; type_code: string }>();
  if (error) throw error;
  if (!doc) throw new DomainError(404, "Documento no encontrado");

  const auditoria = {
    actorId: actor.id,
    actorRoles: actor.roles,
    resourceType: "worker_document",
    resourceId: doc.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    metadata: { workerId, type: doc.type_code },
  };
  if (!canOpenDocument(actor, doc.uploaded_by === actor.id)) {
    await logAudit({ ...auditoria, action: "DOCUMENT_ACCESSED", result: "DENIED" });
    throw new AuthError(403, "No tienes permiso para ver este documento");
  }
  await logAudit({ ...auditoria, action: "DOCUMENT_ACCESSED" });
  return signedUrl(doc.storage_path);
}
