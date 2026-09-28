import "server-only";

import { importJWK, SignJWT, type CryptoKey } from "jose";

import { getRealtimeEnv } from "@/lib/env";

/**
 * JWT de corta vida para suscribirse a canales privados de Supabase Realtime (ADR-004).
 * Lo firma el servidor con su clave ES256, que Supabase conoce (importada en el proyecto).
 * `iss = 'llankana'` y `sub = users.id`: la política RLS de realtime.messages
 * (`private.can_read_realtime_topic`) solo acepta ese emisor y usuarios ACTIVOS.
 */

export const REALTIME_TOKEN_ISSUER = "llankana";
export const REALTIME_TOKEN_TTL_SECONDS = 600;

let clave: { kid: string; key: CryptoKey } | undefined;

async function claveDeFirma() {
  if (!clave) {
    const { kid, kty, crv, x, y, d } = getRealtimeEnv().REALTIME_JWT_PRIVATE_KEY;
    // Solo los campos del material de clave: `key_ops`/`use` del archivo de Supabase impiden importarla.
    clave = { kid, key: (await importJWK({ kty, crv, x, y, d }, "ES256")) as CryptoKey };
  }
  return clave;
}

export async function issueRealtimeToken(userId: string): Promise<{ token: string; expiresAt: string }> {
  const { kid, key } = await claveDeFirma();
  const ahora = Math.floor(Date.now() / 1000);
  const exp = ahora + REALTIME_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
    .setIssuer(REALTIME_TOKEN_ISSUER)
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt(ahora)
    .setExpirationTime(exp)
    .sign(key);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}
