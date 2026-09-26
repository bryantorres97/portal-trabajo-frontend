import { z } from "zod";

/** Esquemas del chat (compartidos por la web, la API y la futura app móvil). */

export const MAX_MESSAGE_LENGTH = 2000;

const cuerpo = z
  .string({ error: "Escribe un mensaje" })
  .transform((v) => v.replace(/\r\n/g, "\n").trim())
  .pipe(
    z
      .string()
      .min(1, "Escribe un mensaje")
      .max(MAX_MESSAGE_LENGTH, `El mensaje admite hasta ${MAX_MESSAGE_LENGTH} caracteres`),
  );

const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

export const startConversationSchema = z.object({
  workerId: z.uuid("Trabajador no válido"),
  body: cuerpo,
  clientMessageId: opcional(z.uuid()),
});

export const sendMessageSchema = z.object({
  body: cuerpo,
  /** Generado por el cliente: reintentar el mismo envío no duplica el mensaje. */
  clientMessageId: opcional(z.uuid()),
});

export const listMessagesSchema = z.object({
  before: opcional(z.coerce.number().int().positive()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const markReadSchema = z.object({ lastMessageId: opcional(z.coerce.number().int().positive()) });

export const reportMessageSchema = z.object({
  reasonCode: z.string().regex(/^[A-Z][A-Z_]*$/, "Selecciona un motivo"),
  description: opcional(z.string().trim().max(1000, "Admite hasta 1000 caracteres")),
});

export const deviceSchema = z.object({
  platform: z.enum(["WEB", "ANDROID", "IOS"]),
  token: z.string().min(20).max(4096),
});

export const markNotificationsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
});

/** Previsualización de una línea (bandeja, notificaciones). */
export function preview(texto: string, max = 80): string {
  const plano = texto.replace(/\s+/g, " ").trim();
  return plano.length > max ? `${plano.slice(0, max - 1)}…` : plano;
}
