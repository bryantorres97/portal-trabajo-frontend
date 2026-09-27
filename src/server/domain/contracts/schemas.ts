import { z } from "zod";

import { UNIDADES_PRECIO } from "@/server/domain/contracts/state-machine";

/**
 * Esquemas de la contratación (compartidos por la web, la API y la futura app móvil).
 * La base repite las reglas críticas (fechas, servicio del trabajador, precio, longitudes).
 */

export const MAX_DESCRIPCION = 1000;
export const MAX_CONDICIONES = 1000;
export const MAX_UBICACION = 200;
export const PRECIO_MAXIMO = 100_000;

const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const fecha = z.iso.date("Fecha no válida");

/** Fecha de hoy en Ecuador (`YYYY-MM-DD`). */
export function hoyEcuador(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const termsSchema = z
  .object({
    description: z
      .string({ error: "Describe el trabajo" })
      .trim()
      .min(10, "Describe el trabajo (al menos 10 caracteres)")
      .max(MAX_DESCRIPCION, `Admite hasta ${MAX_DESCRIPCION} caracteres`),
    serviceId: opcional(z.uuid("Servicio no válido")),
    scheduledStart: fecha,
    scheduledEnd: opcional(fecha),
    parishCode: opcional(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Parroquia no válida")),
    locationDetail: opcional(z.string().trim().max(MAX_UBICACION, `Admite hasta ${MAX_UBICACION} caracteres`)),
    priceAmount: z.coerce
      .number({ error: "Indica el precio" })
      .positive("El precio debe ser mayor que 0")
      .max(PRECIO_MAXIMO, "El precio es demasiado alto")
      .refine((n) => Number.isInteger(Math.round(n * 1e8) / 1e6), "Usa como máximo 2 decimales"),
    priceUnit: z.enum(UNIDADES_PRECIO, { error: "Elige la modalidad de pago" }),
    conditions: opcional(z.string().trim().max(MAX_CONDICIONES, `Admite hasta ${MAX_CONDICIONES} caracteres`)),
  })
  .superRefine((t, ctx) => {
    const hoy = hoyEcuador();
    if (t.scheduledStart < hoy) {
      ctx.addIssue({ code: "custom", path: ["scheduledStart"], message: "La fecha de inicio no puede ser pasada" });
    } else if (t.scheduledStart > sumarDias(hoy, 365)) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledStart"],
        message: "La fecha de inicio debe estar dentro de un año",
      });
    }
    if (t.scheduledEnd && t.scheduledEnd < t.scheduledStart) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledEnd"],
        message: "La fecha de fin no puede ser anterior al inicio",
      });
    } else if (t.scheduledEnd && t.scheduledEnd > sumarDias(t.scheduledStart, 365)) {
      ctx.addIssue({ code: "custom", path: ["scheduledEnd"], message: "El trabajo puede durar hasta un año" });
    }
  });

export type TermsInput = z.infer<typeof termsSchema>;

export const proposeSchema = z.object({ conversationId: z.uuid("Conversación no válida"), terms: termsSchema });

export const counterSchema = z.object({
  /** Versión vigente que el usuario vio: si cambió mientras tanto, 409. */
  baseVersion: z.coerce.number().int().min(1).max(999),
  terms: termsSchema,
});

export const acceptSchema = z.object({
  version: z.coerce.number().int().min(1).max(999),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/i, "Hash no válido"),
});

export const declineSchema = z.object({
  version: z.coerce.number().int().min(1).max(999),
  note: opcional(z.string().trim().max(500, "Admite hasta 500 caracteres")),
});

export const cancelSchema = z.object({
  reason: z
    .string({ error: "Explica el motivo" })
    .trim()
    .min(10, "Explica el motivo (al menos 10 caracteres)")
    .max(500, "Admite hasta 500 caracteres"),
});

export const disputeSchema = z.object({
  reasonCode: z.string().regex(/^[A-Z][A-Z_]*$/, "Selecciona un motivo"),
  description: z
    .string({ error: "Describe el problema" })
    .trim()
    .min(20, "Describe el problema (al menos 20 caracteres)")
    .max(1000, "Admite hasta 1000 caracteres"),
});

export const listContractsSchema = z.object({
  scope: z.enum(["activas", "historial", "todas"]).default("activas"),
});
