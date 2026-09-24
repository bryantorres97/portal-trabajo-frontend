import "server-only";

import { z } from "zod";

import { getAppEnv, getCognitoEnv, type CognitoEnv } from "@/lib/env";

/**
 * Cliente OIDC mínimo para Cognito (Managed Login / Hosted UI).
 * Endpoints: https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html
 */

export const CALLBACK_PATH = "/api/auth/callback";

export function redirectUri(): string {
  return new URL(CALLBACK_PATH, getAppEnv().NEXT_PUBLIC_APP_URL).toString();
}

function endpoint(env: CognitoEnv, path: string): string {
  return `https://${env.COGNITO_DOMAIN}${path}`;
}

/** Proveedores sociales del pool del GAD (instructivo §4). Facebook: pendiente de aprobación de Meta. */
export const IDENTITY_PROVIDERS = ["Google", "Facebook"] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

/** Proveedores sociales habilitados en este ambiente (lista blanca ∩ COGNITO_IDENTITY_PROVIDERS). */
export function enabledIdentityProviders(): IdentityProvider[] {
  const habilitados = getCognitoEnv().COGNITO_IDENTITY_PROVIDERS;
  return IDENTITY_PROVIDERS.filter((p) => habilitados.includes(p));
}

export function parseIdentityProvider(valor: string | null): IdentityProvider | undefined {
  return enabledIdentityProviders().find((p) => p === valor);
}

export function buildAuthorizeUrl(params: {
  state: string;
  nonce: string;
  codeChallenge: string;
  identityProvider?: IdentityProvider;
}): string {
  const env = getCognitoEnv();
  const url = new URL(endpoint(env, "/oauth2/authorize"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.COGNITO_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", env.COGNITO_SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("lang", "es");
  // Salta la pantalla de selección y va directo al proveedor social.
  if (params.identityProvider) url.searchParams.set("identity_provider", params.identityProvider);
  return url.toString();
}

export function buildLogoutUrl(): string {
  const env = getCognitoEnv();
  const url = new URL(endpoint(env, "/logout"));
  url.searchParams.set("client_id", env.COGNITO_CLIENT_ID);
  url.searchParams.set("logout_uri", new URL("/", getAppEnv().NEXT_PUBLIC_APP_URL).toString());
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export class CognitoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CognitoError";
  }
}

function clientHeaders(env: CognitoEnv): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (env.COGNITO_CLIENT_SECRET) {
    const basic = Buffer.from(`${env.COGNITO_CLIENT_ID}:${env.COGNITO_CLIENT_SECRET}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  return headers;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const env = getCognitoEnv();
  if (!env.COGNITO_CLIENT_SECRET) body.set("client_id", env.COGNITO_CLIENT_ID);
  const res = await fetch(endpoint(env, "/oauth2/token"), {
    method: "POST",
    headers: clientHeaders(env),
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = z.object({ error: z.string() }).safeParse(json);
    throw new CognitoError(
      "Cognito rechazó la solicitud de token",
      res.status,
      code.success ? code.data.error : undefined,
    );
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new CognitoError("Respuesta de token inesperada");
  return parsed.data;
}

export function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: codeVerifier,
    }),
  );
}

export function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return postToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

/** Revoca el refresh token (y los access tokens emitidos con él). Errores se ignoran: el logout local continúa. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const env = getCognitoEnv();
  const body = new URLSearchParams({ token: refreshToken });
  if (!env.COGNITO_CLIENT_SECRET) body.set("client_id", env.COGNITO_CLIENT_ID);
  await fetch(endpoint(env, "/oauth2/revoke"), {
    method: "POST",
    headers: clientHeaders(env),
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}
