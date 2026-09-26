import "server-only";

import { z } from "zod";

/**
 * Variables de entorno del servidor, validadas de forma perezosa por grupo:
 * así el portal público puede funcionar aunque Cognito o Supabase todavía
 * no estén configurados en local (bloqueo B2), y el error aparece solo al usar
 * la funcionalidad correspondiente, con un mensaje claro.
 */

const cognitoSchema = z.object({
  COGNITO_REGION: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/, "Región AWS inválida"),
  COGNITO_USER_POOL_ID: z.string().regex(/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/, "User Pool ID inválido"),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_CLIENT_SECRET: z.string().min(1).optional(),
  COGNITO_DOMAIN: z
    .string()
    .min(1)
    .transform((d) => d.replace(/^https?:\/\//, "").replace(/\/$/, "")),
  /** El pool de ciudadanos del GAD soporta solo `openid email profile` (instructivo §3). */
  COGNITO_SCOPES: z.string().default("openid email profile"),
  /** Proveedores sociales habilitados en el pool (p. ej. "Google" o "Google,Facebook"). Vacío = solo login nativo. */
  COGNITO_IDENTITY_PROVIDERS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
  /** Client IDs adicionales aceptados en tokens Bearer (p. ej. app móvil), separados por coma. */
  COGNITO_EXTRA_CLIENT_IDS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
});

const listaUuids = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [],
  )
  .pipe(z.array(z.guid("Cada OID debe ser un GUID")));

/** Microsoft Entra ID para el personal del GAD (ADR-012). Ver docs/setup/entra-dev.md. */
const entraSchema = z.object({
  ENTRA_TENANT_ID: z.guid("ENTRA_TENANT_ID debe ser el GUID del tenant").transform((v) => v.toLowerCase()),
  ENTRA_CLIENT_ID: z.guid("ENTRA_CLIENT_ID debe ser el Application (client) ID").transform((v) => v.toLowerCase()),
  ENTRA_CLIENT_SECRET: z.string().min(1),
  /** `oid` del personal que recibe ADMIN_SISTEMA en su ingreso si todavía no hay administradores. */
  ENTRA_BOOTSTRAP_ADMIN_OIDS: listaUuids,
});

const sessionSchema = z.object({
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
});

const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const appSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "development", "staging", "production"]).default("local"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type CognitoEnv = z.infer<typeof cognitoSchema>;
export type EntraEnv = z.infer<typeof entraSchema>;

function parseGroup<T extends z.ZodType>(nombre: string, schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const detalle = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración de ${nombre} inválida o incompleta (${detalle}). Ver docs/setup/env.md`);
  }
  return result.data;
}

function memo<T>(fn: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= fn());
}

export const getAppEnv = memo(() => parseGroup("aplicación", appSchema));
export const getCognitoEnv = memo(() => parseGroup("Cognito", cognitoSchema));
export const getEntraEnv = memo(() => parseGroup("Microsoft Entra ID", entraSchema));
export const getSessionEnv = memo(() => parseGroup("sesión", sessionSchema));
export const getSupabaseEnv = memo(() => parseGroup("Supabase", supabaseSchema));

/** Indica si el login está configurado (para mostrar un aviso en lugar de fallar). */
export function isAuthConfigured(): boolean {
  return cognitoSchema.safeParse(process.env).success && sessionSchema.safeParse(process.env).success;
}

/** Indica si el ingreso del personal con Microsoft Entra ID está configurado. */
export function isStaffAuthConfigured(): boolean {
  return entraSchema.safeParse(process.env).success && sessionSchema.safeParse(process.env).success;
}
