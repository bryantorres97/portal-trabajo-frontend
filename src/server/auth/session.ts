import "server-only";

import { getSessionEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { refreshTokens, revokeRefreshToken } from "@/server/auth/cognito";
import { decryptPayload, encryptPayload, randomToken, sha256Hex } from "@/server/auth/crypto";
import { refreshStaffTokens } from "@/server/auth/entra";
import { getAdminDb } from "@/server/db/admin";

/**
 * Sesiones opacas del servidor (ADR-005). La cookie contiene un token aleatorio;
 * la base guarda su hash y los tokens del proveedor cifrados.
 * Origen: COGNITO (ciudadanos) o ENTRA (personal del GAD, ADR-012).
 */

export type AuthSource = "COGNITO" | "ENTRA";

/** Tokens del proveedor (misma forma en Cognito y Entra). */
export type SessionTokens = { access_token: string; refresh_token?: string; expires_in: number; token_type?: string };

export type SessionIdentity = { issuer: string; sub: string };

const PROPOSITO_TOKENS = "session-tokens";
/** Renovar el access token cuando falten menos de 5 minutos. */
const MARGEN_RENOVACION_MS = 5 * 60 * 1000;

/** `src`, `iss` y `sub` se agregaron en la Fase 2B: las sesiones anteriores son de Cognito. */
type TokensCifrados = { at: string; rt?: string; src?: AuthSource; iss?: string; sub?: string };

type SessionRow = {
  id: string;
  user_id: string;
  tokens_enc: string;
  access_expires_at: string;
  expires_at: string;
  revoked_at: string | null;
  auth_source: AuthSource;
};

const SESSION_COLUMNS = "id, user_id, tokens_enc, access_expires_at, expires_at, revoked_at, auth_source";

export type ActiveSession = {
  id: string;
  userId: string;
  source: AuthSource;
  accessToken: string;
  /** Identidad con la que se abrió la sesión (siempre presente en sesiones ENTRA). */
  identity?: SessionIdentity;
};

function identidadDe(tokens: TokensCifrados): SessionIdentity | undefined {
  return tokens.iss && tokens.sub ? { issuer: tokens.iss, sub: tokens.sub } : undefined;
}

/** Revoca el refresh token en el proveedor. Entra no tiene endpoint de revocación por token. */
async function revocarEnProveedor(tokens: TokensCifrados | null): Promise<void> {
  if (tokens?.rt && (tokens.src ?? "COGNITO") === "COGNITO") await revokeRefreshToken(tokens.rt);
}

async function cifrarTokens(tokens: TokensCifrados, segundos: number) {
  return encryptPayload(tokens, getSessionEnv().SESSION_SECRET, PROPOSITO_TOKENS, segundos);
}

async function descifrarTokens(jwe: string) {
  return decryptPayload<TokensCifrados>(jwe, getSessionEnv().SESSION_SECRET, PROPOSITO_TOKENS);
}

export async function createSession(params: {
  userId: string;
  tokens: SessionTokens;
  maxAgeSeconds: number;
  source?: AuthSource;
  identity?: SessionIdentity;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ cookieValue: string }> {
  const source = params.source ?? "COGNITO";
  if (source === "ENTRA" && !params.identity) throw new Error("Una sesión de Entra requiere la identidad");
  const cookieValue = randomToken(32);
  const ahora = Date.now();
  const { error } = await getAdminDb()
    .from("auth_sessions")
    .insert({
      token_hash: await sha256Hex(cookieValue),
      user_id: params.userId,
      auth_source: source,
      tokens_enc: await cifrarTokens(
        {
          at: params.tokens.access_token,
          rt: params.tokens.refresh_token,
          src: source,
          iss: params.identity?.issuer,
          sub: params.identity?.sub,
        },
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
    .select(SESSION_COLUMNS)
    .eq("token_hash", await sha256Hex(cookieValue))
    .maybeSingle<SessionRow>();
  if (error) throw error;
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;

  const tokens = await descifrarTokens(row.tokens_enc);
  if (!tokens) return null;
  const source = row.auth_source;
  const identity = identidadDe(tokens);
  if (source === "ENTRA" && !identity) return null;
  const sesion = (accessToken: string): ActiveSession => ({
    id: row.id,
    userId: row.user_id,
    source,
    accessToken,
    identity,
  });

  if (Date.parse(row.access_expires_at) - Date.now() > MARGEN_RENOVACION_MS) return sesion(tokens.at);

  if (!tokens.rt) return null;
  try {
    const nuevos =
      source === "ENTRA" && identity
        ? await refreshStaffTokens(tokens.rt, identity.sub)
        : await refreshTokens(tokens.rt);
    const restanteSeg = Math.max(60, Math.floor((Date.parse(row.expires_at) - Date.now()) / 1000));
    const { error: errorUpdate } = await db
      .from("auth_sessions")
      .update({
        tokens_enc: await cifrarTokens(
          { ...tokens, at: nuevos.access_token, rt: nuevos.refresh_token ?? tokens.rt },
          restanteSeg,
        ),
        access_expires_at: new Date(Date.now() + nuevos.expires_in * 1000).toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (errorUpdate) throw errorUpdate;
    return sesion(nuevos.access_token);
  } catch (e) {
    logger.warn("auth.refresh_failed", { sessionId: row.id, error: e });
    await db.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
    return null;
  }
}

/** Revoca la sesión local y el refresh token en Cognito. Devuelve el usuario y el origen si existía. */
export async function destroySession(
  cookieValue: string | undefined,
): Promise<{ userId: string; source: AuthSource } | null> {
  if (!cookieValue || cookieValue.length > 128) return null;
  const db = getAdminDb();
  const { data: row } = await db
    .from("auth_sessions")
    .select(SESSION_COLUMNS)
    .eq("token_hash", await sha256Hex(cookieValue))
    .maybeSingle<SessionRow>();
  if (!row || row.revoked_at) return null;

  await db.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  await revocarEnProveedor(await descifrarTokens(row.tokens_enc));
  return { userId: row.user_id, source: row.auth_source };
}

export type SessionSummary = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
};

/** Sesiones activas del usuario (para "Mis sesiones"). */
export async function listActiveSessions(userId: string, currentSessionId?: string): Promise<SessionSummary[]> {
  const { data, error } = await getAdminDb()
    .from("auth_sessions")
    .select("id, created_at, last_seen_at, expires_at, user_agent, ip")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_seen_at", { ascending: false })
    .returns<
      {
        id: string;
        created_at: string;
        last_seen_at: string;
        expires_at: string;
        user_agent: string | null;
        ip: string | null;
      }[]
    >();
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    lastSeenAt: s.last_seen_at,
    expiresAt: s.expires_at,
    userAgent: s.user_agent,
    ip: s.ip,
    current: s.id === currentSessionId,
  }));
}

/** Revoca en Cognito los refresh tokens contenidos en sesiones cifradas (errores ignorados). */
export async function revokeEncryptedTokens(tokensEnc: string[]): Promise<void> {
  await Promise.all(tokensEnc.map(async (jwe) => revocarEnProveedor(await descifrarTokens(jwe))));
}

/**
 * Revoca sesiones del usuario: una en particular o todas ("cerrar sesión en todos los dispositivos").
 * Devuelve cuántas sesiones web se revocaron. También revoca sus refresh tokens en Cognito.
 * Al cerrar todas, marca `users.tokens_valid_after`: la app móvil guarda sus propios tokens y
 * deja de ser aceptada hasta que vuelva a iniciar sesión (ver `findBearerUserId`).
 */
export async function revokeUserSessions(userId: string, sessionId?: string): Promise<number> {
  if (!sessionId) {
    const { error } = await getAdminDb()
      .from("users")
      .update({ tokens_valid_after: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw error;
  }
  let query = getAdminDb()
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (sessionId) query = query.eq("id", sessionId);
  const { data, error } = await query.select("tokens_enc").returns<{ tokens_enc: string }[]>();
  if (error) throw error;
  await revokeEncryptedTokens((data ?? []).map((r) => r.tokens_enc));
  return data?.length ?? 0;
}
