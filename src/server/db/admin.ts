import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Cliente de Supabase con la secret key (rol `service_role`).
 * Solo para uso en el servidor, desde repositorios y casos de uso (ADR-001):
 * la autorización se aplica ANTES de llamar a este cliente, en `src/server/auth/authorize.ts`.
 */
export function getAdminDb(): SupabaseClient {
  if (!client) {
    const env = getSupabaseEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-application-name": "acolita-web" } },
    });
  }
  return client;
}
