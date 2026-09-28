import { z } from "zod";

/**
 * Calificaciones (Fase 7). RN-07: el comentario admite hasta 200 palabras en la web, la API y la base
 * (`private.word_count`, con la misma regla: palabras separadas por espacios).
 */

export const MAX_PALABRAS = 200;
export const MAX_CARACTERES_COMENTARIO = 2000;

export function countWords(texto: string | null | undefined): number {
  const limpio = (texto ?? "").trim();
  return limpio === "" ? 0 : limpio.split(/\s+/).length;
}

export const reviewSchema = z.object({
  rating: z.coerce
    .number({ error: "Elige de 1 a 5 estrellas" })
    .int("Elige de 1 a 5 estrellas")
    .min(1, "Elige de 1 a 5 estrellas")
    .max(5, "Elige de 1 a 5 estrellas"),
  comment: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() || undefined : v),
    z
      .string()
      .max(MAX_CARACTERES_COMENTARIO, `Admite hasta ${MAX_CARACTERES_COMENTARIO} caracteres`)
      .refine((t) => countWords(t) <= MAX_PALABRAS, `El comentario admite hasta ${MAX_PALABRAS} palabras`)
      .optional(),
  ),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

export const reportReviewSchema = z.object({
  reasonCode: z.string().regex(/^[A-Z][A-Z_]*$/, "Selecciona un motivo"),
  description: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(1000, "Admite hasta 1000 caracteres").optional(),
  ),
});

export const hideReviewSchema = z.object({
  reviewId: z.uuid("Calificación no válida"),
  hidden: z.enum(["true", "false"]).transform((v) => v === "true"),
  reason: z
    .string({ error: "Registra el motivo" })
    .trim()
    .min(10, "Registra el motivo (al menos 10 caracteres)")
    .max(500, "Admite hasta 500 caracteres"),
});

export const FILTROS_MODERACION = ["denunciadas", "ocultas", "todas"] as const;
export type FiltroModeracion = (typeof FILTROS_MODERACION)[number];

export const ETIQUETAS_ESTRELLAS = ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"] as const;
