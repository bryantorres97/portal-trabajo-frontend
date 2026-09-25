import "server-only";

import { z } from "zod";

import { TAMANO_PAGINA, type Filtros } from "@/lib/busqueda";
import { getAdminDb } from "@/server/db/admin";

/**
 * Lectura PÚBLICA de trabajadores. Solo usa las funciones SQL `fn_public_*`, que devuelven
 * columnas explícitas de trabajadores HABILITADOS (RN-01) sin datos privados (RN-19).
 */

export type WorkerCard = {
  id: string;
  displayName: string;
  specialty: string | null;
  yearsExperience: number;
  isAvailable: boolean;
  parish: string | null;
  ratingAvg: number;
  ratingCount: number;
  contractsCompleted: number;
  services: { slug: string; name: string }[];
};

export type WorkerServiceDetail = {
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  description: string | null;
  yearsExperience: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string;
  isPrimary: boolean;
};

export type PublicWorker = Omit<WorkerCard, "services"> & {
  bio: string | null;
  availabilityNote: string | null;
  enabledAt: string | null;
  services: WorkerServiceDetail[];
};

type SearchRow = {
  id: string;
  public_display_name: string;
  specialty: string | null;
  years_experience: number;
  is_available: boolean;
  parish_name: string | null;
  rating_avg: number;
  rating_count: number;
  contracts_completed: number;
  services: { slug: string; name: string }[];
  total_count: number;
};

export type SearchResult = { items: WorkerCard[]; total: number; page: number; pages: number; pageSize: number };

export async function searchWorkers(f: Filtros): Promise<SearchResult> {
  const page = f.pagina ?? 1;
  const { data, error } = await getAdminDb().rpc("fn_public_search_workers", {
    p_q: f.q ?? null,
    p_category: f.categoria ?? null,
    p_service: f.oficio ?? null,
    p_parish: f.parroquia ?? null,
    p_available: f.disponible ? true : null,
    p_min_experience: f.experiencia ?? null,
    p_min_rating: f.calificacion ?? null,
    p_sort: f.orden ?? null,
    p_limit: TAMANO_PAGINA,
    p_offset: (page - 1) * TAMANO_PAGINA,
  });
  if (error) throw error;
  const filas = (data ?? []) as SearchRow[];
  const total = filas.length ? Number(filas[0].total_count) : 0;
  return {
    items: filas.map((r) => ({
      id: r.id,
      displayName: r.public_display_name,
      specialty: r.specialty,
      yearsExperience: r.years_experience,
      isAvailable: r.is_available,
      parish: r.parish_name,
      ratingAvg: Number(r.rating_avg),
      ratingCount: r.rating_count,
      contractsCompleted: r.contracts_completed,
      services: r.services,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / TAMANO_PAGINA)),
    pageSize: TAMANO_PAGINA,
  };
}

type WorkerRow = Omit<SearchRow, "total_count" | "services"> & {
  public_bio: string | null;
  availability_note: string | null;
  enabled_at: string | null;
  services: {
    slug: string;
    name: string;
    category: string;
    categorySlug: string;
    description: string | null;
    yearsExperience: number | null;
    priceMin: number | string | null;
    priceMax: number | string | null;
    priceUnit: string;
    isPrimary: boolean;
  }[];
};

/** Perfil público de un trabajador habilitado, o null (no existe, no está habilitado o id inválido). */
export async function getPublicWorker(id: string): Promise<PublicWorker | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await getAdminDb().rpc("fn_public_worker", { p_id: id });
  if (error) throw error;
  const r = ((data ?? []) as WorkerRow[])[0];
  if (!r) return null;
  const num = (v: number | string | null) => (v == null ? null : Number(v));
  return {
    id: r.id,
    displayName: r.public_display_name,
    specialty: r.specialty,
    bio: r.public_bio,
    yearsExperience: r.years_experience,
    isAvailable: r.is_available,
    availabilityNote: r.availability_note,
    parish: r.parish_name,
    ratingAvg: Number(r.rating_avg),
    ratingCount: r.rating_count,
    contractsCompleted: r.contracts_completed,
    enabledAt: r.enabled_at,
    services: r.services.map((s) => ({ ...s, priceMin: num(s.priceMin), priceMax: num(s.priceMax) })),
  };
}
