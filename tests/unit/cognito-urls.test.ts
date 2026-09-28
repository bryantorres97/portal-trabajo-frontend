import { beforeAll, describe, expect, it } from "vitest";

import { buildAuthorizeUrl, buildLogoutUrl, parseIdentityProvider } from "@/server/auth/cognito";

beforeAll(() => {
  Object.assign(process.env, {
    COGNITO_REGION: "us-east-2",
    COGNITO_USER_POOL_ID: "us-east-2_TestPool1",
    COGNITO_CLIENT_ID: "cliente-web",
    COGNITO_DOMAIN: "https://ejemplo.auth.us-east-2.amazoncognito.com/",
    COGNITO_IDENTITY_PROVIDERS: "Google",
    NEXT_PUBLIC_APP_URL: "http://localhost:3300",
  });
  delete process.env.COGNITO_SCOPES;
});

describe("URLs de Cognito (instructivo del GAD, pasos 3 y 5)", () => {
  it("authorize: code + PKCE S256 + state + nonce, con scopes soportados por el pool del GAD", () => {
    const url = new URL(buildAuthorizeUrl({ state: "st", nonce: "no", codeChallenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://ejemplo.auth.us-east-2.amazoncognito.com/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "cliente-web",
      redirect_uri: "http://localhost:3300/api/auth/callback",
      scope: "openid email profile",
      state: "st",
      nonce: "no",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.has("identity_provider")).toBe(false);
  });

  it("authorize: salta directo al proveedor social solo si está en la lista blanca", () => {
    expect(parseIdentityProvider("Google")).toBe("Google");
    expect(parseIdentityProvider("google")).toBeUndefined();
    expect(parseIdentityProvider("EvilIdP")).toBeUndefined();
    expect(parseIdentityProvider("Facebook")).toBeUndefined(); // no habilitado en este ambiente
    const url = new URL(buildAuthorizeUrl({ state: "s", nonce: "n", codeChallenge: "c", identityProvider: "Google" }));
    expect(url.searchParams.get("identity_provider")).toBe("Google");
  });

  it("logout: client_id + logout_uri registrada", () => {
    const url = new URL(buildLogoutUrl());
    expect(url.pathname).toBe("/logout");
    expect(url.searchParams.get("client_id")).toBe("cliente-web");
    expect(url.searchParams.get("logout_uri")).toBe("http://localhost:3300/");
  });
});
