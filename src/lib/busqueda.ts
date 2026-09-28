import { z } from "zod";

/**
 * Filtros de búsqueda de trabajadores (Fase 3). Se leen desde la URL (`/buscar?...`) y desde
 * la API; la URL es la fuente de verdad para que los resultados sean compartibles.
 */

export const ORDENES = ["relevancia", "calificacion", "experiencia", "nombre"] as const;
export type Orden = (typeof ORDENES)[number];
export const TAMANO_PAGINA = 12;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(80);

/** Valores inválidos se descartan (no rompen la página): una URL manipulada muestra resultados sin ese filtro. */
const tolerante = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional().catch(undefined));

export const filtrosSchema = z.object({
  q: tolerante(z.string().trim().max(100)),
  categoria: tolerante(slug),
  oficio: tolerante(slug),
  parroquia: tolerante(slug),
  disponible: tolerante(z.enum(["1"]).transform(() => true as const)),
  experiencia: tolerante(z.coerce.number().int().min(1).max(40)),
  calificacion: tolerante(z.coerce.number().int().min(1).max(5)),
  orden: tolerante(z.enum(ORDENES)),
  pagina: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(500).catch(1).default(1),
  ),
});

export type Filtros = z.infer<typeof filtrosSchema>;

/** Normaliza searchParams de Next (string | string[] | undefined) a un objeto plano. */
export function aObjeto(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): Record<string, string> {
  const obj: Record<string, string> = {};
  if (params instanceof URLSearchParams) {
    params.forEach((v, k) => (obj[k] ??= v));
  } else {
    for (const [k, v] of Object.entries(params)) if (v !== undefined) obj[k] = Array.isArray(v) ? v[0] : v;
  }
  return obj;
}

export function parseFiltros(params: Record<string, string | string[] | undefined> | URLSearchParams): Filtros {
  return filtrosSchema.parse(aObjeto(params));
}

/** Construye la URL de /buscar con los filtros dados (omite vacíos y la página 1). */
export function urlBusqueda(filtros: Partial<Filtros>, cambios: Partial<Filtros> = {}): string {
  const f = { ...filtros, ...cambios };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.oficio) p.set("oficio", f.oficio);
  if (f.parroquia) p.set("parroquia", f.parroquia);
  if (f.disponible) p.set("disponible", "1");
  if (f.experiencia) p.set("experiencia", String(f.experiencia));
  if (f.calificacion) p.set("calificacion", String(f.calificacion));
  if (f.orden) p.set("orden", f.orden);
  if (f.pagina && f.pagina > 1) p.set("pagina", String(f.pagina));
  const qs = p.toString();
  return qs ? `/buscar?${qs}` : "/buscar";
}

export function hayFiltros(f: Filtros): boolean {
  return Boolean(f.q || f.categoria || f.oficio || f.parroquia || f.disponible || f.experiencia || f.calificacion);
}

const unidades: Record<string, string> = {
  JORNAL: "por día",
  HORA: "por hora",
  OBRA: "por obra",
  SERVICIO: "por servicio",
};

/** "$25 – $35 por día" (tarifa referencial). */
export function formatearTarifa(min: number | null, max: number | null, unidad: string | null): string | null {
  if (min == null && max == null) return null;
  const f = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const rango = min != null && max != null && min !== max ? `${f(min)} – ${f(max)}` : f((min ?? max) as number);
  return `${rango} ${unidades[unidad ?? "JORNAL"] ?? ""}`.trim();
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}
