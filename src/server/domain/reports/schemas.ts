import { z } from "zod";

import { ACCIONES, RESOLUCIONES } from "@/server/domain/reports/state-machine";

/** Denuncias (Fase 8): esquemas compartidos por la web, la API y el panel. */

const texto = (min: number, max: number, mensaje: string) =>
  z.string({ error: mensaje }).trim().min(min, mensaje).max(max, `Admite hasta ${max} caracteres`);

const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

export const createReportSchema = z.object({
  targetType: z.enum(["WORKER", "CLIENT", "CONVERSATION"], { error: "Tipo de denuncia no válido" }),
  targetId: z.uuid("Objeto no válido"),
  reasonCode: z.string().regex(/^[A-Z][A-Z_]*$/, "Selecciona un motivo"),
  description: texto(10, 1000, "Cuéntanos qué pasó (al menos 10 caracteres)"),
});

export const evidenceNoteSchema = z.object({ note: texto(1, 1000, "Escribe la información") });

export const OPERACIONES = [
  "ASSIGN_ME",
  "UNASSIGN",
  "PRIORITY",
  "REVIEW",
  "REQUEST_INFO",
  "ESCALATE",
  "RESOLVE",
  "DISCARD",
  "NOTE",
] as const;

export const reportUpdateSchema = z.object({
  reportId: z.uuid(),
  op: z.enum(OPERACIONES),
  note: opcional(z.string().trim().max(1000, "Admite hasta 1000 caracteres")),
  resolution: opcional(z.enum(RESOLUCIONES, { error: "Elige el resultado" })),
  priority: opcional(z.coerce.number().int().min(1).max(3)),
});

export const accessEvidenceSchema = z.object({
  reportId: z.uuid(),
  justification: texto(20, 1000, "Escribe la justificación del acceso (al menos 20 caracteres)"),
});

export const moderationSchema = z.object({
  reportId: z.uuid(),
  action: z.enum(ACCIONES, { error: "Elige la acción" }),
  reason: texto(10, 1000, "Registra el motivo (al menos 10 caracteres)"),
  /** Fecha de fin (YYYY-MM-DD, fin del día en Ecuador) para las suspensiones. */
  endsOn: opcional(z.iso.date("Fecha no válida")),
});

export const liftSchema = z.object({
  actionId: z.uuid(),
  reason: texto(10, 500, "Registra el motivo (al menos 10 caracteres)"),
});

export const disputeResolutionSchema = z.object({
  reportId: z.uuid(),
  contractId: z.uuid(),
  outcome: z.enum(["FINALIZADA", "CANCELADA"]),
  note: texto(10, 1000, "Registra la justificación (al menos 10 caracteres)"),
});

/** Fin del día (23:59:59) de una fecha de calendario en Ecuador (UTC−5), como instante ISO. */
export function finDelDiaEcuador(fecha: string): string {
  return new Date(`${fecha}T23:59:59-05:00`).toISOString();
}
