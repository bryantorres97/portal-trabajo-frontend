import "server-only";

import { getAdminDb } from "@/server/db/admin";
import { checkFile, type FileKind } from "@/server/domain/documents/files";
import { DomainError } from "@/server/errors";

/**
 * Bucket PRIVADO `worker-files` (documentos y fotos de trabajadores). Solo el servidor sube
 * archivos y firma URLs con la secret key; no hay políticas de Storage para anon/authenticated.
 */
export const WORKER_BUCKET = "worker-files";

/** Vigencia de las URLs firmadas de documentos (04-modelo-datos.md §7). */
export const SIGNED_URL_SECONDS = 300;

export type ValidatedFile = { bytes: Uint8Array; kind: FileKind; size: number; sha256: string; name: string };

/** Lee y valida un archivo de un FormData (tamaño y firma binaria). */
export async function readUpload(
  value: FormDataEntryValue | null,
  allowed: readonly FileKind[],
): Promise<ValidatedFile> {
  if (!value || typeof value === "string" || value.size === 0) {
    throw new DomainError(422, "Selecciona un archivo.");
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const check = checkFile(bytes, value.type, allowed);
  if (!check.ok) throw new DomainError(422, check.error);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    bytes,
    kind: check.kind,
    size: bytes.byteLength,
    sha256: Buffer.from(digest).toString("hex"),
    name: value.name,
  };
}

export async function uploadObject(path: string, file: ValidatedFile): Promise<void> {
  const { error } = await getAdminDb()
    .storage.from(WORKER_BUCKET)
    .upload(path, file.bytes, { contentType: file.kind, upsert: false, cacheControl: "private, max-age=0" });
  if (error) throw Object.assign(new Error(`No se pudo guardar el archivo: ${error.message}`), { cause: error });
}

/** Borra un objeto recién subido cuando falla el registro en la base (evita huérfanos). */
export async function removeObject(path: string): Promise<void> {
  await getAdminDb().storage.from(WORKER_BUCKET).remove([path]);
}

export async function signedUrl(path: string, seconds = SIGNED_URL_SECONDS): Promise<string> {
  const { data, error } = await getAdminDb().storage.from(WORKER_BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw Object.assign(new Error("No se pudo firmar la URL"), { cause: error });
  return data.signedUrl;
}

export async function downloadObject(path: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const { data, error } = await getAdminDb().storage.from(WORKER_BUCKET).download(path);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), type: data.type || "application/octet-stream" };
}
