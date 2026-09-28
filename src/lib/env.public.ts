import { z } from "zod";

/**
 * Variables públicas (se incrustan en el bundle del navegador en `next build`).
 * Deben leerse con acceso estático `process.env.NEXT_PUBLIC_*` para que Next las inline.
 * NUNCA agregar aquí secretos.
 */
/** Una variable definida pero vacía se trata como ausente (p. ej. en el panel de Vercel). */
const vacioComoAusente = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(vacioComoAusente, z.url().default("http://localhost:3000")),
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(vacioComoAusente, z.url().optional()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.preprocess(vacioComoAusente, z.string().min(1).optional()),
});

export const publicEnv = schema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
