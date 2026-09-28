import { z } from "zod";

/**
 * Esquemas de validación de usuarios y perfiles. Se comparten entre formularios
 * (cliente) y servidor (Server Actions y API): el servidor SIEMPRE revalida.
 */

const textoLimpio = (min: number, max: number, campo: string) =>
  z
    .string({ error: `${campo} es obligatorio` })
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(min, `${campo} debe tener al menos ${min} caracteres`)
        .max(max, `${campo} admite hasta ${max} caracteres`),
    );

const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

export const clientProfileSchema = z.object({
  fullName: textoLimpio(3, 120, "El nombre"),
  phone: opcional(
    z
      .string()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^09\d{8}$/, "Ingresa un celular de Ecuador de 10 dígitos que empiece con 09")),
  ),
  sector: opcional(textoLimpio(2, 80, "El sector")),
});

export type ClientProfileInput = z.infer<typeof clientProfileSchema>;

export const roleChangeSchema = z.object({
  userId: z.uuid("Usuario inválido"),
  roleCode: z.string().regex(/^[A-Z][A-Z_]*$/, "Rol inválido"),
});

export const statusChangeSchema = z
  .object({
    userId: z.uuid("Usuario inválido"),
    status: z.enum(["ACTIVO", "BLOQUEADO"]),
    reason: opcional(z.string().trim().max(500, "El motivo admite hasta 500 caracteres")),
  })
  .refine((v) => v.status !== "BLOQUEADO" || (v.reason?.length ?? 0) >= 5, {
    path: ["reason"],
    message: "Indica el motivo del bloqueo (mínimo 5 caracteres)",
  });

export const userSearchSchema = z.object({
  q: opcional(z.string().trim().max(120)),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

/** Primer ingreso de la app móvil: el ID token del mismo inicio de sesión que el access token (Bearer). */
export const mobileBootstrapSchema = z.object({
  idToken: z.string({ error: "Falta el ID token" }).min(20, "ID token inválido").max(8192, "ID token inválido"),
});
