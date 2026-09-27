import { z } from "zod";

/** Panel administrativo (Fase 9): filtros de fechas, reportes, auditoría y contenido. */

function hoyEc(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Periodos rápidos del filtro (días de Ecuador, inclusivos). */
export const PERIODOS = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 } as const;
export type Periodo = keyof typeof PERIODOS;

const fecha = z.iso.date();

/**
 * Rango de fechas desde los parámetros de la URL: `periodo` (7d, 30d…) o `desde`/`hasta`.
 * Por defecto, los últimos 30 días. Nunca lanza: corrige valores inválidos.
 */
export function parseRango(sp: Record<string, string | string[] | undefined>, ahora = new Date()) {
  const texto = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const hasta = fecha.safeParse(texto("hasta")).success ? texto("hasta")! : hoyEc(ahora);
  const periodo = (texto("periodo") ?? "") as Periodo;
  let desde: string;
  if (periodo in PERIODOS) desde = restarDias(hasta, PERIODOS[periodo] - 1);
  else if (fecha.safeParse(texto("desde")).success && texto("desde")! <= hasta) desde = texto("desde")!;
  else desde = restarDias(hasta, 29);
  // Máximo dos años (la base también lo exige).
  if (restarDias(hasta, 731) > desde) desde = restarDias(hasta, 731);
  return { desde, hasta, periodo: periodo in PERIODOS ? periodo : null };
}

export const TIPOS_REPORTE = ["trabajadores", "contrataciones", "denuncias"] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export const faqSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  audience: z.enum(["GENERAL", "CLIENTES", "TRABAJADORES"]),
  question: z.string().trim().min(5, "Escribe la pregunta").max(200, "Admite hasta 200 caracteres"),
  answerMd: z.string().trim().min(5, "Escribe la respuesta").max(4000, "Admite hasta 4000 caracteres"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  published: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export const legalDraftSchema = z.object({
  code: z.enum(["TERMINOS", "PRIVACIDAD"]),
  title: z.string().trim().min(3, "Escribe el título").max(200, "Admite hasta 200 caracteres"),
  contentMd: z.string().trim().min(20, "El texto es demasiado corto").max(100_000, "El texto es demasiado largo"),
});

export const legalPublishSchema = z.object({
  code: z.enum(["TERMINOS", "PRIVACIDAD"]),
  version: z.coerce.number().int().positive(),
});

export const ETIQUETAS_AUDIENCIA = {
  GENERAL: "Todos",
  CLIENTES: "Quienes contratan",
  TRABAJADORES: "Trabajadores",
} as const;
