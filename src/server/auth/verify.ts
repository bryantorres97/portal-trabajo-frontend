import "server-only";

import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { CognitoAccessTokenPayload, CognitoIdTokenPayload } from "aws-jwt-verify/jwt-model";

import { getCognitoEnv } from "@/lib/env";

/**
 * Verificación de JWT de Cognito: firma (JWKS del pool, en caché), `iss`, `exp`,
 * `token_use` y `client_id`/`aud`. Acepta el app client web y los adicionales
 * configurados (p. ej. la futura app móvil) — ADR-005.
 */

function crearVerificadores() {
  const env = getCognitoEnv();
  const clientIds = [env.COGNITO_CLIENT_ID, ...env.COGNITO_EXTRA_CLIENT_IDS];
  return {
    access: CognitoJwtVerifier.create({
      userPoolId: env.COGNITO_USER_POOL_ID,
      tokenUse: "access",
      clientId: clientIds,
    }),
    id: CognitoJwtVerifier.create({
      userPoolId: env.COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: env.COGNITO_CLIENT_ID,
    }),
  };
}

let verificadores: ReturnType<typeof crearVerificadores> | undefined;

export function getVerifiers() {
  return (verificadores ??= crearVerificadores());
}

/** Solo para tests: reinicia los verificadores (p. ej. tras cambiar variables de entorno). */
export function resetVerifiersForTests() {
  verificadores = undefined;
}

export async function verifyAccessToken(token: string): Promise<CognitoAccessTokenPayload> {
  return getVerifiers().access.verify(token);
}

export async function verifyIdToken(token: string, expectedNonce?: string): Promise<CognitoIdTokenPayload> {
  const payload = await getVerifiers().id.verify(token);
  if (expectedNonce !== undefined && payload.nonce !== expectedNonce) {
    throw new Error("El nonce del ID token no coincide");
  }
  return payload;
}
