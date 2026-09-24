import type { Jwk } from "aws-jwt-verify/jwk";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getVerifiers, resetVerifiersForTests, verifyAccessToken, verifyIdToken } from "@/server/auth/verify";

/**
 * Verificación de JWT con un JWKS de prueba (sin AWS): se firma con una clave RSA local
 * y se inyecta el JWKS en la caché del verificador.
 */

const REGION = "us-east-2";
const POOL = "us-east-2_TestPool1";
const CLIENT = "cliente-web";
const MOVIL = "cliente-movil";
const ISS = `https://cognito-idp.${REGION}.amazonaws.com/${POOL}`;
const KID = "test-kid";

let privateKey: CryptoKey;
let jwk: Jwk;
const envOriginal = { ...process.env };

async function firmar(claims: Record<string, unknown>, opciones: { exp?: number; iss?: string } = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(opciones.iss ?? ISS)
    .setIssuedAt(ahora)
    .setExpirationTime(opciones.exp ?? ahora + 3600)
    .sign(privateKey);
}

beforeAll(async () => {
  Object.assign(process.env, {
    COGNITO_REGION: REGION,
    COGNITO_USER_POOL_ID: POOL,
    COGNITO_CLIENT_ID: CLIENT,
    COGNITO_DOMAIN: "test.auth.us-east-2.amazoncognito.com",
    COGNITO_EXTRA_CLIENT_IDS: MOVIL,
  });
  const par = await generateKeyPair("RS256", { extractable: true });
  privateKey = par.privateKey;
  jwk = { ...(await exportJWK(par.publicKey)), kty: "RSA", kid: KID, alg: "RS256", use: "sig" } as Jwk;
  resetVerifiersForTests();
  const { access, id } = getVerifiers();
  access.cacheJwks({ keys: [jwk] });
  id.cacheJwks({ keys: [jwk] });
});

afterAll(() => {
  process.env = envOriginal;
  resetVerifiersForTests();
});

describe("verifyAccessToken", () => {
  it("acepta un access token válido del cliente web", async () => {
    const token = await firmar({ sub: "abc", token_use: "access", client_id: CLIENT, scope: "openid" });
    await expect(verifyAccessToken(token)).resolves.toMatchObject({ sub: "abc" });
  });

  it("acepta el client ID adicional (app móvil)", async () => {
    const token = await firmar({ sub: "abc", token_use: "access", client_id: MOVIL });
    await expect(verifyAccessToken(token)).resolves.toMatchObject({ client_id: MOVIL });
  });

  it("rechaza otro client_id", async () => {
    const token = await firmar({ sub: "abc", token_use: "access", client_id: "otro" });
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rechaza un ID token usado como access token", async () => {
    const token = await firmar({ sub: "abc", token_use: "id", aud: CLIENT });
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rechaza tokens expirados", async () => {
    const token = await firmar(
      { sub: "abc", token_use: "access", client_id: CLIENT },
      { exp: Math.floor(Date.now() / 1000) - 60 },
    );
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rechaza otro emisor (pool distinto)", async () => {
    const token = await firmar(
      { sub: "abc", token_use: "access", client_id: CLIENT },
      { iss: `https://cognito-idp.${REGION}.amazonaws.com/us-east-2_OtroPool` },
    );
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rechaza firmas de otra clave", async () => {
    const otra = await generateKeyPair("RS256");
    const token = await new SignJWT({ sub: "abc", token_use: "access", client_id: CLIENT })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuer(ISS)
      .setExpirationTime("1h")
      .sign(otra.privateKey);
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });
});

describe("verifyIdToken", () => {
  it("valida el nonce", async () => {
    const token = await firmar({ sub: "abc", token_use: "id", aud: CLIENT, nonce: "n1" });
    await expect(verifyIdToken(token, "n1")).resolves.toMatchObject({ sub: "abc" });
    await expect(verifyIdToken(token, "n2")).rejects.toThrow(/nonce/);
  });

  it("rechaza un ID token emitido para el cliente móvil (solo web usa ID tokens aquí)", async () => {
    const token = await firmar({ sub: "abc", token_use: "id", aud: MOVIL, nonce: "n1" });
    await expect(verifyIdToken(token, "n1")).rejects.toThrow();
  });
});
