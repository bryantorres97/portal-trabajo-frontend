import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import { getAppEnv, getEntraEnv } from "@/lib/env";
import type { IdentityClaims } from "@/server/auth/users";

/**
 * Cliente OIDC para el personal del GAD con Microsoft Entra ID (ADR-012): endpoint v2.0,
 * authorization code + PKCE, cliente confidencial y un solo tenant.
 * https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
 */

const AUTHORITY = "https://login.microsoftonline.com";
export const STAFF_CALLBACK_PATH = "/api/auth/staff/callback";
/** Pantalla de ingreso del personal; también es el destino tras el logout de Entra. */
export const STAFF_SIGNIN_PATH = "/admin/ingresar";
export const STAFF_SCOPES = "openid profile email offline_access";

export function staffIssuer(tenantId: string): string {
  return `${AUTHORITY}/${tenantId}/v2.0`;
}

function endpoint(path: string): string {
  return `${AUTHORITY}/${getEntraEnv().ENTRA_TENANT_ID}/oauth2/v2.0/${path}`;
}

function appUrl(path: string): string {
  return new URL(path, getAppEnv().NEXT_PUBLIC_APP_URL).toString();
}

export function staffRedirectUri(): string {
  return appUrl(STAFF_CALLBACK_PATH);
}

export function buildStaffAuthorizeUrl(params: { state: string; nonce: string; codeChallenge: string }): string {
  const url = new URL(endpoint("authorize"));
  url.searchParams.set("client_id", getEntraEnv().ENTRA_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("redirect_uri", staffRedirectUri());
  url.searchParams.set("scope", STAFF_SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Evita entrar sin querer con otra cuenta de Microsoft abierta en el navegador.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Logout de Entra. `post_logout_redirect_uri` debe estar registrada como redirect URI de la app. */
export function buildStaffLogoutUrl(): string {
  const url = new URL(endpoint("logout"));
  url.searchParams.set("post_logout_redirect_uri", appUrl(STAFF_SIGNIN_PATH));
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().int().positive(),
  token_type: z.string(),
});

export type StaffTokenResponse = z.infer<typeof tokenResponseSchema>;

/** Error de Entra ID. `reason` distingue los rechazos que se muestran al usuario. */
export class StaffAuthError extends Error {
  constructor(
    message: string,
    readonly reason: "token" | "tenant" | "guest" | "nonce" | "oid" = "token",
    readonly code?: string,
  ) {
    super(message);
    this.name = "StaffAuthError";
  }
}

async function postToken(body: URLSearchParams): Promise<StaffTokenResponse> {
  const env = getEntraEnv();
  body.set("client_id", env.ENTRA_CLIENT_ID);
  body.set("client_secret", env.ENTRA_CLIENT_SECRET);
  body.set("scope", STAFF_SCOPES);
  const res = await fetch(endpoint("token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = z.object({ error: z.string() }).safeParse(json);
    throw new StaffAuthError(
      "Entra ID rechazó la solicitud de token",
      "token",
      error.success ? error.data.error : undefined,
    );
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new StaffAuthError("Respuesta de token inesperada");
  return parsed.data;
}

export function exchangeStaffCode(code: string, codeVerifier: string): Promise<StaffTokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: staffRedirectUri(),
      code_verifier: codeVerifier,
    }),
  );
}

/**
 * Renueva la sesión con el refresh token. Si Entra entrega un ID token nuevo, se verifica
 * que siga siendo la misma persona. Falla si el GAD deshabilitó la cuenta o revocó sus sesiones.
 */
export async function refreshStaffTokens(refreshToken: string, expectedOid: string): Promise<StaffTokenResponse> {
  const tokens = await postToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
  if (tokens.id_token) {
    const identity = await verifyStaffIdToken(tokens.id_token);
    if (identity.sub !== expectedOid) throw new StaffAuthError("El token renovado es de otra persona", "oid");
  }
  return tokens;
}

let jwks: JWTVerifyGetKey | undefined;

function tenantJwks(): JWTVerifyGetKey {
  return (jwks ??= createRemoteJWKSet(new URL(`${AUTHORITY}/${getEntraEnv().ENTRA_TENANT_ID}/discovery/v2.0/keys`)));
}

/**
 * Verifica el ID token (firma con las claves del tenant, `iss`, `aud`, `exp`) y valida los
 * claims del personal. `getKey` solo se reemplaza en tests.
 */
export async function verifyStaffIdToken(
  token: string,
  expectedNonce?: string,
  getKey: JWTVerifyGetKey = tenantJwks(),
): Promise<IdentityClaims> {
  const env = getEntraEnv();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getKey, {
      issuer: staffIssuer(env.ENTRA_TENANT_ID),
      audience: env.ENTRA_CLIENT_ID,
      algorithms: ["RS256"],
      clockTolerance: 60,
    }));
  } catch (e) {
    throw new StaffAuthError(`ID token inválido: ${(e as Error).message}`);
  }
  return staffIdentityFromClaims(payload, { tenantId: env.ENTRA_TENANT_ID, expectedNonce });
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identidad del personal a partir de claims YA verificados.
 * - La identidad es `oid` (estable en el tenant), no `sub` (distinto por aplicación).
 * - `tid` debe ser el tenant del GAD.
 * - Se rechazan cuentas externas (invitados, cuentas personales): traen `idp` distinto del emisor.
 * - El ID token v2 no trae `amr`: el MFA lo exige el acceso condicional del GAD.
 */
export function staffIdentityFromClaims(
  claims: JWTPayload,
  opts: { tenantId: string; expectedNonce?: string },
): IdentityClaims {
  const tenantId = opts.tenantId.toLowerCase();
  const issuer = staffIssuer(tenantId);
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

  if (String(claims.tid ?? "").toLowerCase() !== tenantId) {
    throw new StaffAuthError("El token pertenece a otro tenant", "tenant");
  }
  if (opts.expectedNonce !== undefined && claims.nonce !== opts.expectedNonce) {
    throw new StaffAuthError("El nonce del ID token no coincide", "nonce");
  }
  const idp = texto(claims.idp);
  if (idp && idp !== issuer && idp !== `https://sts.windows.net/${tenantId}/`) {
    throw new StaffAuthError("Las cuentas externas al tenant no tienen acceso", "guest");
  }
  const oid = texto(claims.oid)?.toLowerCase();
  if (!oid || !guid.test(oid)) throw new StaffAuthError("El token no trae el claim oid", "oid");

  const email = texto(claims.email) ?? texto(claims.preferred_username);
  return {
    issuer,
    sub: oid,
    provider: "ENTRA",
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : undefined,
    // Entra no verifica el correo: lo administra el GAD. No se usa para vincular cuentas.
    emailVerified: false,
    displayName: texto(claims.name)?.slice(0, 120),
  };
}
