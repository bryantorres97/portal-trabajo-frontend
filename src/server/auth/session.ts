import "server-only";

import { getSessionEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { refreshTokens, revokeRefreshToken, type TokenResponse } from "@/server/auth/cognito";
import { decryptPayload, encryptPayload, randomToken, sha256Hex } from "@/server/auth/crypto";
import { getAdminDb } from "@/server/db/admin";

/**
 * Sesiones opacas del servidor (ADR-005). La cookie contiene un token aleatorio;
 * la base guarda su hash y los tokens de Cognito cifrados.
 */

const PROPOSITO_TOKENS = "session-tokens";
/** Renovar el access token cuando falten menos de 5 minutos. */
const MARGEN_RENOVACION_MS = 5 * 60 * 1000;

type TokensCifrados = { at: string; rt?: string };

type SessionRow = {
  id: string;
  user_id: string;
  tokens_enc: string;
  access_expires_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type ActiveSession = {
  id: string;
  userId: string;
  accessToken: string;
};

async function cifrarTokens(tokens: TokensCifrados, segundos: number) {
  return encryptPayload(tokens, getSessionEnv().SESSION_SECRET, PROPOSITO_TOKENS, segundos);
}

async function descifrarTokens(jwe: string) {
  return decryptPayload<TokensCifrados>(jwe, getSessionEnv().SESSION_SECRET, PROPOSITO_TOKENS);
}

export async function createSession(params: {
  userId: string;
  tokens: TokenResponse;
  maxAgeSeconds: number;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ cookieValue: string }> {
  const cookieValue = randomToken(32);
  const ahora = Date.now();
  const { error } = await getAdminDb()
    .from("auth_sessions")
    .insert({
      token_hash: await sha256Hex(cookieValue),
      user_id: params.userId,
      tokens_enc: await cifrarTokens(
        { at: params.tokens.access_token, rt: params.tokens.refresh_token },
        params.maxAgeSeconds,
      ),
      access_expires_at: new Date(ahora + params.tokens.expires_in * 1000).toISOString(),
      expires_at: new Date(ahora + params.maxAgeSeconds * 1000).toISOString(),
      ip: params.ip ?? null,
      user_agent: params.userAgent?.slice(0, 512) ?? null,
    });
  if (error) throw error;
  return { cookieValue };
}

/**
 * Resuelve la sesión a partir del valor de la cookie. Si el access token está por
 * expirar, lo renueva con el refresh token y actualiza la fila (no requiere reescribir la cookie).
 * Devuelve null si la sesión no existe, fue revocada, expiró o no se pudo renovar.
 */
export async function resolveSession(cookieValue: string | undefined): Promise<ActiveSession | null> {
  if (!cookieValue || cookieValue.length > 128) return null;
  const db = getAdminDb();
  const { data: row, error } = await db
    .from("auth_sessions")
    .select("id, user_id, tokens_enc, access_expires_at, expires_at, revoked_at")
    .eq("token_hash", await sha256Hex(cookieValue))
    .maybeSingle<SessionRow>();
  if (error) throw error;
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;

  const tokens = await descifrarTokens(row.tokens_enc);
  if (!tokens) return null;

  if (Date.parse(row.access_expires_at) - Date.now() > MARGEN_RENOVACION_MS) {
    return { id: row.id, userId: row.user_id, accessToken: tokens.at };
  }

  if (!tokens.rt) return null;
  try {
    const nuevos = await refreshTokens(tokens.rt);
    const restanteSeg = Math.max(60, Math.floor((Date.parse(row.expires_at) - Date.now()) / 1000));
    const { error: errorUpdate } = await db
      .from("auth_sessions")
      .update({
        tokens_enc: await cifrarTokens({ at: nuevos.access_token, rt: nuevos.refresh_token ?? tokens.rt }, restanteSeg),
        access_expires_at: new Date(Date.now() + nuevos.expires_in * 1000).toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (errorUpdate) throw errorUpdate;
    return { id: row.id, userId: row.user_id, accessToken: nuevos.access_token };
  } catch (e) {
    logger.warn("auth.refresh_failed", { sessionId: row.id, error: e });
    await db.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
    return null;
  }
}

/** Revoca la sesión local y el refresh token en Cognito. Devuelve el userId si existía. */
export async function destroySession(cookieValue: string | undefined): Promise<string | null> {
  if (!cookieValue || cookieValue.length > 128) return null;
  const db = getAdminDb();
  const { data: row } = await db
    .from("auth_sessions")
    .select("id, user_id, tokens_enc, access_expires_at, expires_at, revoked_at")
    .eq("token_hash", await sha256Hex(cookieValue))
    .maybeSingle<SessionRow>();
  if (!row || row.revoked_at) return null;

  await db.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  const tokens = await descifrarTokens(row.tokens_enc);
  if (tokens?.rt) await revokeRefreshToken(tokens.rt);
  return row.user_id;
}
