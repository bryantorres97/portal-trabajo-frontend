import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  StaffAuthError,
  buildStaffAuthorizeUrl,
  buildStaffLogoutUrl,
  staffIdentityFromClaims,
  verifyStaffIdToken,
} from "@/server/auth/entra";

/** Ingreso del personal con Microsoft Entra ID (ADR-012), sin red: JWKS local de prueba. */

const TENANT = "7c1e0a52-3b9d-4f6e-a8c1-2d5f9e0b4a17";
const CLIENT = "0f4b6c2e-1a2b-4c3d-9e8f-0a1b2c3d4e5f";
const ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const OID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  Object.assign(process.env, {
    ENTRA_TENANT_ID: TENANT.toUpperCase(),
    ENTRA_CLIENT_ID: CLIENT,
    ENTRA_CLIENT_SECRET: "secreto-de-prueba",
    NEXT_PUBLIC_APP_URL: "http://localhost:3300",
  });
  const par = await generateKeyPair("RS256", { extractable: true });
  privateKey = par.privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(par.publicKey)), kid: "k1", alg: "RS256" }] });
});

const base = { tid: TENANT, oid: OID, nonce: "n1", name: "Ana Funcionaria", email: "Ana@GAD.gob.ec" };

async function firmar(claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: number } = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? CLIENT)
    .setSubject("sub-por-aplicacion")
    .setIssuedAt(ahora)
    .setExpirationTime(opts.exp ?? ahora + 3600)
    .sign(privateKey);
}

describe("URLs de Entra ID", () => {
  it("authorize: v2.0 del tenant, code + PKCE S256 + state + nonce, scopes con offline_access", () => {
    const url = new URL(buildStaffAuthorizeUrl({ state: "st", nonce: "no", codeChallenge: "ch" }));
    expect(url.origin + url.pathname).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT,
      response_type: "code",
      response_mode: "query",
      redirect_uri: "http://localhost:3300/api/auth/staff/callback",
      scope: "openid profile email offline_access",
      state: "st",
      nonce: "no",
      code_challenge: "ch",
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });

  it("logout: vuelve a la pantalla de ingreso del personal", () => {
    const url = new URL(buildStaffLogoutUrl());
    expect(url.origin + url.pathname).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/logout`);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:3300/admin/ingresar");
  });
});

describe("claims del personal", () => {
  it("usa oid como identidad, normaliza el correo y marca el proveedor ENTRA", () => {
    expect(staffIdentityFromClaims({ ...base, iss: ISS }, { tenantId: TENANT, expectedNonce: "n1" })).toEqual({
      issuer: ISS,
      sub: OID,
      provider: "ENTRA",
      email: "ana@gad.gob.ec",
      emailVerified: false,
      displayName: "Ana Funcionaria",
    });
  });

  it("sin email usa preferred_username si parece un correo", () => {
    const { email, ...resto } = base;
    void email;
    expect(
      staffIdentityFromClaims({ ...resto, preferred_username: "ana@gad.onmicrosoft.com" }, { tenantId: TENANT }),
    ).toMatchObject({ email: "ana@gad.onmicrosoft.com" });
    expect(
      staffIdentityFromClaims({ ...resto, preferred_username: "ana" }, { tenantId: TENANT }).email,
    ).toBeUndefined();
  });

  it.each([
    ["otro tenant", { ...base, tid: "11111111-2222-4333-8444-555555555555" }, "tenant"],
    [
      "cuenta personal (MSA) invitada",
      { ...base, idp: "https://sts.windows.net/9188040d-6c67-4c5b-b112-36a304b66dad/" },
      "guest",
    ],
    ["invitado de otro tenant", { ...base, idp: "live.com" }, "guest"],
    ["nonce distinto", { ...base, nonce: "otro" }, "nonce"],
    ["sin oid", { ...base, oid: undefined }, "oid"],
  ])("rechaza: %s", (_nombre, claims, reason) => {
    expect(() => staffIdentityFromClaims(claims, { tenantId: TENANT, expectedNonce: "n1" })).toThrow(
      expect.objectContaining({ reason }),
    );
  });

  it("acepta idp igual al propio tenant", () => {
    expect(() =>
      staffIdentityFromClaims({ ...base, idp: `https://sts.windows.net/${TENANT}/` }, { tenantId: TENANT }),
    ).not.toThrow();
  });
});

describe("verificación del ID token", () => {
  it("acepta un token firmado por el tenant para esta aplicación", async () => {
    const identidad = await verifyStaffIdToken(await firmar(base), "n1", jwks);
    expect(identidad.sub).toBe(OID);
  });

  it.each([
    ["otro emisor", { iss: "https://login.microsoftonline.com/common/v2.0" }],
    ["otra audiencia", { aud: "otra-app" }],
    ["vencido", { exp: Math.floor(Date.now() / 1000) - 3600 }],
  ])("rechaza: %s", async (_nombre, opts) => {
    await expect(verifyStaffIdToken(await firmar(base, opts), "n1", jwks)).rejects.toBeInstanceOf(StaffAuthError);
  });

  it("rechaza una firma de otra clave", async () => {
    const otra = await generateKeyPair("RS256");
    const token = await new SignJWT(base)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISS)
      .setAudience(CLIENT)
      .setExpirationTime("1h")
      .sign(otra.privateKey);
    await expect(verifyStaffIdToken(token, "n1", jwks)).rejects.toBeInstanceOf(StaffAuthError);
  });
});
