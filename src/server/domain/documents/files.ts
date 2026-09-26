/**
 * Validación de archivos subidos (documentos y fotos del trabajador). El tipo se decide por la
 * FIRMA BINARIA del contenido, nunca por la extensión ni por el `Content-Type` que envía el
 * navegador: un archivo con MIME falso se rechaza. Módulo puro, sin dependencias de servidor.
 */

export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export type FileKind = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export const EXTENSION: Record<FileKind, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const DOCUMENT_TYPES: readonly FileKind[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const PHOTO_TYPES: readonly FileKind[] = ["image/jpeg", "image/png", "image/webp"];

const empiezaCon = (b: Uint8Array, firma: number[], desde = 0) => firma.every((x, i) => b[desde + i] === x);

/** Detecta el tipo real por los primeros bytes. */
export function sniffFileKind(bytes: Uint8Array): FileKind | null {
  if (empiezaCon(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (empiezaCon(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (empiezaCon(bytes, [0x52, 0x49, 0x46, 0x46]) && empiezaCon(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp"; // RIFF....WEBP
  }
  return null;
}

export type FileCheck = { ok: true; kind: FileKind } | { ok: false; error: string };

/**
 * Verifica tamaño y tipo. `declaredType` (el del navegador) debe coincidir con el contenido real:
 * un PDF renombrado a .jpg, o un ejecutable declarado como PDF, se rechazan.
 */
export function checkFile(bytes: Uint8Array, declaredType: string, allowed: readonly FileKind[]): FileCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: "El archivo supera el máximo de 4 MB." };
  const kind = sniffFileKind(bytes);
  if (!kind || !allowed.includes(kind)) {
    return {
      ok: false,
      error: `Formato no admitido. Usa ${allowed.map((k) => EXTENSION[k].toUpperCase()).join(", ")}.`,
    };
  }
  const declarado = declaredType.toLowerCase() === "image/jpg" ? "image/jpeg" : declaredType.toLowerCase();
  if (declarado && declarado !== "application/octet-stream" && declarado !== kind) {
    return { ok: false, error: "El tipo del archivo no coincide con su contenido." };
  }
  return { ok: true, kind };
}

/** Nombre original saneado (solo para mostrarlo; nunca se usa como ruta). */
export function safeOriginalName(name: string): string {
  return (
    name
      .normalize("NFC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .trim()
      .slice(0, 200) || "archivo"
  );
}

/** Rutas dentro del bucket `worker-files`: el nombre es un UUID, nunca el nombre original. */
export function documentPath(workerId: string, fileId: string, kind: FileKind): string {
  return `workers/${workerId}/documents/${fileId}.${EXTENSION[kind]}`;
}

export function photoPath(workerId: string, fileId: string, kind: FileKind): string {
  return `workers/${workerId}/photos/${fileId}.${EXTENSION[kind]}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
