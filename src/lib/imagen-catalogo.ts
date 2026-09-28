/**
 * Imágenes de los oficios del catálogo. La base guarda una ruta del bucket público
 * `catalog-images` (`services/<uuid>.webp`) o, para las fotos provisionales del repositorio, una
 * ruta del sitio (`/images/oficios/…`). Módulo puro: sirve en servidor, cliente y pruebas.
 */

export const CATALOG_IMAGE_BUCKET = "catalog-images";

/** Ruta dentro del bucket para la imagen nueva de un oficio: un UUID, nunca el nombre original. */
export function serviceImagePath(uuid: string, extension: string): string {
  return `services/${uuid}.${extension}`;
}

/** ¿La ruta apunta a un objeto del bucket (y no a un archivo del repositorio)? */
export function isCatalogObject(path: string | null | undefined): path is string {
  return !!path && !path.startsWith("/");
}

/** URL para mostrar la imagen: pública del bucket, o la ruta del sitio tal cual. */
export function catalogImageUrl(path: string | null | undefined, supabaseUrl: string): string | null {
  if (!path) return null;
  if (!isCatalogObject(path)) return path;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${CATALOG_IMAGE_BUCKET}/${path}`;
}
