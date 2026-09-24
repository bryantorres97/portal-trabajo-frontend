import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { logAudit } from "@/server/audit/log";
import { createSession, destroySession, resolveSession } from "@/server/auth/session";
import { findUserIdByIdentity, loadUser, upsertUserFromLogin, type IdentityClaims } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";

/**
 * Integración contra Supabase local (`pnpm db:start`). Ejecutar con `pnpm test:integration`,
 * que toma URL y secret key de `supabase status`.
 */

const tokens = (expiresIn = 3600) => ({
  access_token: "access-token-de-prueba",
  expires_in: expiresIn,
  token_type: "Bearer",
});

const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";

function identidad(parcial: Partial<IdentityClaims> = {}): IdentityClaims {
  return { issuer: ISS, sub: randomUUID(), provider: "COGNITO", emailVerified: false, ...parcial };
}

describe("usuarios (alta just-in-time, ADR-008)", () => {
  it("crea el usuario con rol CLIENTE en el primer login y lo actualiza después", async () => {
    const id = identidad({ email: `${randomUUID()}@test.ec`, emailVerified: true, displayName: "Ana Prueba" });
    const primero = await upsertUserFromLogin(id);
    expect(primero.created).toBe(true);

    const segundo = await upsertUserFromLogin({ ...id, displayName: "Otro nombre" });
    expect(segundo.created).toBe(false);
    expect(segundo.user.id).toBe(primero.user.id);
    expect(segundo.user.display_name).toBe("Ana Prueba");

    await expect(findUserIdByIdentity(ISS, id.sub)).resolves.toBe(primero.user.id);
    const user = await loadUser(primero.user.id);
    expect(user?.roles).toEqual(["CLIENTE"]);
    expect(user?.permissions).toEqual([]);
  });

  it("el mismo sub en otro pool (issuer) es otra identidad", async () => {
    const sub = randomUUID();
    const a = await upsertUserFromLogin(identidad({ sub }));
    const b = await upsertUserFromLogin(identidad({ sub, issuer: `${ISS}-otro` }));
    expect(b.created).toBe(true);
    expect(b.user.id).not.toBe(a.user.id);
  });

  it("no vincula automáticamente por email entre proveedores", async () => {
    const email = `${randomUUID()}@test.ec`;
    const nativo = await upsertUserFromLogin(identidad({ email, emailVerified: true }));
    const google = await upsertUserFromLogin(identidad({ email, emailVerified: true, provider: "Google" }));
    expect(google.created).toBe(true);
    expect(google.user.id).not.toBe(nativo.user.id);
  });

  it("carga los permisos efectivos de los roles vigentes", async () => {
    const { user } = await upsertUserFromLogin(identidad());
    await getAdminDb().from("user_roles").insert({ user_id: user.id, role_code: "ADMIN_TRABAJADORES" });

    const cargado = await loadUser(user.id);
    expect(cargado?.roles).toEqual(["ADMIN_TRABAJADORES", "CLIENTE"]);
    expect(cargado?.permissions).toContain("worker.enable");
    expect(cargado?.permissions).not.toContain("audit.read");
  });
});

describe("sesiones opacas", () => {
  it("crea, resuelve y revoca una sesión; los tokens no quedan en claro", async () => {
    const { user } = await upsertUserFromLogin(identidad());
    const { cookieValue } = await createSession({ userId: user.id, tokens: tokens(), maxAgeSeconds: 3600 });

    const { data: fila } = await getAdminDb()
      .from("auth_sessions")
      .select("tokens_enc, token_hash")
      .eq("user_id", user.id)
      .single();
    expect(fila?.tokens_enc).not.toContain("access-token-de-prueba");
    expect(fila?.token_hash).not.toBe(cookieValue);

    await expect(resolveSession(cookieValue)).resolves.toMatchObject({
      userId: user.id,
      accessToken: "access-token-de-prueba",
    });

    await expect(destroySession(cookieValue)).resolves.toBe(user.id);
    await expect(resolveSession(cookieValue)).resolves.toBeNull();
  });

  it("rechaza cookies desconocidas o manipuladas", async () => {
    await expect(resolveSession("no-existe")).resolves.toBeNull();
    await expect(resolveSession(undefined)).resolves.toBeNull();
    await expect(resolveSession("x".repeat(500))).resolves.toBeNull();
  });

  it("sin refresh token, una sesión con access token por vencer se invalida", async () => {
    const { user } = await upsertUserFromLogin(identidad());
    const { cookieValue } = await createSession({ userId: user.id, tokens: tokens(60), maxAgeSeconds: 3600 });
    await expect(resolveSession(cookieValue)).resolves.toBeNull();
  });
});

describe("auditoría", () => {
  it("inserta registros y no permite modificarlos", async () => {
    const resourceId = randomUUID();
    await logAudit({ action: "TEST_INTEGRACION", resourceType: "test", resourceId, ip: "190.1.2.3" });

    const db = getAdminDb();
    const { data } = await db.from("audit_log").select("id, action, ip").eq("resource_id", resourceId).single();
    expect(data).toMatchObject({ action: "TEST_INTEGRACION", ip: "190.1.2.3" });

    const { error } = await db.from("audit_log").update({ action: "HACK" }).eq("id", data!.id);
    expect(error).not.toBeNull();
  });
});
