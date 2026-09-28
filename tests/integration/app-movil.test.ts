import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { revokeUserSessions } from "@/server/auth/session";
import { findBearerUserId, findIdentityOwner, upsertUserFromLogin } from "@/server/auth/users";

/** Integración de la Fase 11 (app móvil) contra Supabase local (`pnpm test:integration`). */

const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";

describe("Cierre de sesión global para tokens Bearer (app móvil)", () => {
  it("un token autenticado antes de «cerrar en todos los dispositivos» deja de resolver usuario", async () => {
    const sub = randomUUID();
    const { user } = await upsertUserFromLogin({ issuer: ISS, sub, provider: "COGNITO", emailVerified: false });
    const antes = Math.floor(Date.now() / 1000) - 60;

    expect(await findBearerUserId(ISS, sub, antes)).toBe(user.id);
    expect((await findIdentityOwner(ISS, sub))?.tokensValidAfter).toBeNull();

    await revokeUserSessions(user.id);

    expect((await findIdentityOwner(ISS, sub))?.tokensValidAfter).not.toBeNull();
    expect(await findBearerUserId(ISS, sub, antes)).toBeNull();
    // Un nuevo inicio de sesión (auth_time posterior) vuelve a valer.
    expect(await findBearerUserId(ISS, sub, Math.floor(Date.now() / 1000) + 1)).toBe(user.id);
  });

  it("cerrar una sola sesión web no afecta a la app", async () => {
    const sub = randomUUID();
    const { user } = await upsertUserFromLogin({ issuer: ISS, sub, provider: "COGNITO", emailVerified: false });
    await revokeUserSessions(user.id, randomUUID());
    expect((await findIdentityOwner(ISS, sub))?.tokensValidAfter).toBeNull();
  });

  it("una identidad desconocida no resuelve usuario", async () => {
    expect(await findBearerUserId(ISS, randomUUID(), Math.floor(Date.now() / 1000))).toBeNull();
    expect(await findIdentityOwner(ISS, randomUUID())).toBeNull();
  });
});
