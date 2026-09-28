import "server-only";

import { z } from "zod";

import { getSupabaseEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { catalogImageUrl, isCatalogObject, serviceImagePath } from "@/lib/imagen-catalogo";
import { requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { EXTENSION, PHOTO_TYPES } from "@/server/domain/documents/files";
import { throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";
import { CATALOG_BUCKET, readUpload, removeObject, uploadObject } from "@/server/storage/files";

export type ColorMarca = "verde" | "azul" | "magenta" | "amarillo" | "naranja";

export type PublicService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string;
  imagePath: string | null;
  color: ColorMarca;
  enabledWorkers: number;
  category: { slug: string; name: string };
};

export type PublicCategory = {
  slug: string;
  name: string;
  description: string | null;
  color: ColorMarca;
  services: PublicService[];
};

export type Parish = { code: string; name: string; kind: "URBANA" | "RURAL" };

type CatalogRow = {
  category_slug: string;
  category_name: string;
  category_description: string | null;
  category_color: ColorMarca;
  service_id: string;
  service_slug: string;
  service_name: string;
  service_description: string | null;
  reference_price_min: number | null;
  reference_price_max: number | null;
  price_unit: string;
  image_path: string | null;
  color: ColorMarca;
  enabled_workers: number;
};

/** URL pública de una imagen del catálogo (bucket o ruta del sitio). */
function urlImagen(path: string | null): string | null {
  return catalogImageUrl(path, getSupabaseEnv().NEXT_PUBLIC_SUPABASE_URL);
}

/** Catálogo público activo, agrupado por categoría, con el número de trabajadores habilitados por oficio. */
export async function getPublicCatalog(): Promise<PublicCategory[]> {
  const { data, error } = await getAdminDb().rpc("fn_public_catalog");
  if (error) throw error;
  const filas = (data ?? []) as CatalogRow[];
  const categorias = new Map<string, PublicCategory>();
  for (const r of filas) {
    let cat = categorias.get(r.category_slug);
    if (!cat) {
      cat = {
        slug: r.category_slug,
        name: r.category_name,
        description: r.category_description,
        color: r.category_color,
        services: [],
      };
      categorias.set(r.category_slug, cat);
    }
    cat.services.push({
      id: r.service_id,
      slug: r.service_slug,
      name: r.service_name,
      description: r.service_description,
      priceMin: r.reference_price_min == null ? null : Number(r.reference_price_min),
      priceMax: r.reference_price_max == null ? null : Number(r.reference_price_max),
      priceUnit: r.price_unit,
      imagePath: urlImagen(r.image_path),
      color: r.color,
      enabledWorkers: Number(r.enabled_workers),
      category: { slug: r.category_slug, name: r.category_name },
    });
  }
  return [...categorias.values()];
}

export async function getPublicServices(): Promise<PublicService[]> {
  return (await getPublicCatalog()).flatMap((c) => c.services);
}

export async function getPublicService(slug: string): Promise<PublicService | null> {
  return (await getPublicServices()).find((s) => s.slug === slug) ?? null;
}

export async function listParishes(): Promise<Parish[]> {
  const { data, error } = await getAdminDb()
    .from("parishes")
    .select("code, name, kind")
    .eq("active", true)
    .order("sort_order")
    .returns<Parish[]>();
  if (error) throw error;
  return data ?? [];
}

// -----------------------------------------------------------------------------
// Administración (catalog.manage)
// -----------------------------------------------------------------------------

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: ColorMarca;
  sortOrder: number;
  active: boolean;
};

export type AdminService = AdminCategory & {
  categoryId: string;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string;
  /** URL para mostrarla, o null si no tiene imagen. */
  imagePath: string | null;
};

export async function listCatalogForAdmin(actor: AppUser) {
  requirePermission(actor, "catalog.manage");
  const db = getAdminDb();
  const [{ data: cats, error: e1 }, { data: servs, error: e2 }] = await Promise.all([
    db
      .from("categories")
      .select("id, slug, name, description, color, sort_order, active")
      .order("sort_order")
      .order("name"),
    db
      .from("services")
      .select(
        "id, category_id, slug, name, description, color, sort_order, active, reference_price_min, reference_price_max, price_unit, image_path",
      )
      .order("sort_order")
      .order("name"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const categorias: AdminCategory[] = (cats ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    color: c.color,
    sortOrder: c.sort_order,
    active: c.active,
  }));
  const servicios: AdminService[] = (servs ?? []).map((s) => ({
    id: s.id,
    categoryId: s.category_id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    color: s.color,
    sortOrder: s.sort_order,
    active: s.active,
    priceMin: s.reference_price_min == null ? null : Number(s.reference_price_min),
    priceMax: s.reference_price_max == null ? null : Number(s.reference_price_max),
    priceUnit: s.price_unit,
    imagePath: urlImagen(s.image_path),
  }));
  return { categorias, servicios };
}

const COLORES = ["verde", "azul", "magenta", "amarillo", "naranja"] as const;
const UNIDADES = ["JORNAL", "HORA", "OBRA", "SERVICIO"] as const;

const opcional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s.optional());

const base = {
  id: opcional(z.uuid()),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Usa minúsculas, números y guiones (p. ej. «gasfiteria»)")
    .max(60),
  name: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  description: opcional(z.string().trim().max(300)),
  color: z.enum(COLORES),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
};

export const categorySchema = z.object(base);

export const serviceSchema = z
  .object({
    ...base,
    categoryId: z.uuid("Selecciona una categoría"),
    priceMin: opcional(z.coerce.number().min(0).max(100000)),
    priceMax: opcional(z.coerce.number().min(0).max(100000)),
    priceUnit: z.enum(UNIDADES),
  })
  .refine((v) => v.priceMin == null || v.priceMax == null || v.priceMin <= v.priceMax, {
    path: ["priceMax"],
    message: "El máximo debe ser mayor o igual al mínimo",
  });

export async function saveCategory(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requirePermission(actor, "catalog.manage");
  const d = categorySchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_save_category", {
    p_actor_id: actor.id,
    p_id: d.id ?? null,
    p_slug: d.slug,
    p_name: d.name,
    p_description: d.description ?? null,
    p_color: d.color,
    p_sort_order: d.sortOrder,
    p_active: d.active,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export async function saveService(actor: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requirePermission(actor, "catalog.manage");
  const d = serviceSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_save_service", {
    p_actor_id: actor.id,
    p_id: d.id ?? null,
    p_category_id: d.categoryId,
    p_slug: d.slug,
    p_name: d.name,
    p_description: d.description ?? null,
    p_price_min: d.priceMin ?? null,
    p_price_max: d.priceMax ?? null,
    p_price_unit: d.priceUnit,
    p_color: d.color,
    p_sort_order: d.sortOrder,
    p_active: d.active,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export const serviceImageSchema = z.object({ id: z.uuid() });

/**
 * Sube (o quita, con `file` null) la imagen de un oficio. El tipo se verifica por la
 * firma binaria; el cambio queda auditado en la base y la imagen anterior se borra del bucket.
 */
export async function setServiceImage(
  actor: AppUser,
  input: unknown,
  file: FormDataEntryValue | null,
  ctx: RequestContext,
): Promise<void> {
  requirePermission(actor, "catalog.manage");
  const { id } = serviceImageSchema.parse(input);
  let nueva: string | null = null;
  if (file !== null) {
    const archivo = await readUpload(file, PHOTO_TYPES);
    nueva = serviceImagePath(crypto.randomUUID(), EXTENSION[archivo.kind]);
    await uploadObject(nueva, archivo, CATALOG_BUCKET, "31536000");
  }
  const { data, error } = await getAdminDb().rpc("fn_admin_set_service_image", {
    p_actor_id: actor.id,
    p_id: id,
    p_image_path: nueva,
    ...auditParams(ctx),
  });
  if (error) {
    if (nueva) await removeObject(nueva, CATALOG_BUCKET).catch(() => undefined);
    throwPg(error);
  }
  const anterior = data as string | null;
  if (isCatalogObject(anterior)) {
    await removeObject(anterior, CATALOG_BUCKET).catch((e) =>
      logger.warn("catalog.image_cleanup_failed", { path: anterior, error: e }),
    );
  }
}
