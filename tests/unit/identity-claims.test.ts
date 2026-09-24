import { describe, expect, it } from "vitest";

import { identityFromIdToken } from "@/server/auth/users";

const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_Pool";

describe("identityFromIdToken (ADR-008)", () => {
  it("usuario nativo: proveedor COGNITO y nombre desde given_name/family_name", () => {
    expect(
      identityFromIdToken({
        iss: ISS,
        sub: "s1",
        email: "Ana@Correo.EC",
        email_verified: true,
        given_name: "Ana",
        family_name: "Pérez",
      }),
    ).toEqual({
      issuer: ISS,
      sub: "s1",
      provider: "COGNITO",
      email: "ana@correo.ec",
      emailVerified: true,
      displayName: "Ana Pérez",
    });
  });

  it("usuario federado: toma el proveedor del claim identities", () => {
    const id = identityFromIdToken({
      iss: ISS,
      sub: "s2",
      email_verified: "true",
      identities: [{ providerName: "Google", userId: "123" }],
      name: "Luis",
    });
    expect(id.provider).toBe("Google");
    expect(id.emailVerified).toBe(true);
    expect(id.displayName).toBe("Luis");
  });

  it("sin email verificado ni nombre", () => {
    const id = identityFromIdToken({ iss: ISS, sub: "s3", email_verified: false });
    expect(id).toMatchObject({ emailVerified: false, email: undefined, displayName: undefined });
  });

  it("sanea nombres de proveedor inesperados", () => {
    const id = identityFromIdToken({ iss: ISS, sub: "s4", identities: [{ providerName: "Proveedor raro!<>" }] });
    expect(id.provider).toBe("Proveedorraro");
  });
});
