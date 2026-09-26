import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { createSession, destroySession, resolveSession } from "@/server/auth/session";
import {
  loadUser,
  upsertStaffFromLogin,
  upsertUserFromLogin,
  type AppUser,
  type IdentityClaims,
} from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import type { RequestContext } from "@/server/http/request-info";
import { grantRole } from "@/server/users/admin";
import { linkIdentity } from "@/server/users/identities";

/** Fase 2B — acceso del personal con Microsoft Entra ID (ADR-012), contra Supabase local. */

const ENTRA_ISS = "https://login.microsoftonline.com/00000000-0000-4000-8000-000000000001/v2.0";
const COGNITO_ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";
const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-2b" };

function personal(parcial: Partial<IdentityClaims> = {}): IdentityClaims {
  return {
    issuer: ENTRA_ISS,
    sub: randomUUID(),
    provider: "ENTRA",
    email: `${randomUUID().slice(0, 8)}@gad.test`,
    emailVerified: false,
    displayName: "Funcionario de Prueba",
    ...parcial,
  };
}

function ciudadano(parcial: Partial<IdentityClaims> = {}): IdentityClaims {
  return { issuer: COGNITO_ISS, sub: randomUUID(), provider: "COGNITO", emailVerified: true, ...parcial };
}

async function auditoria(action: string, resourceId: string) {
  const { data } = await getAdminDb()
    .from("audit_log")
    .select("action, actor_id, metadata")
    .eq("action", action)
    .eq("resource_id", resourceId);
  return data ?? [];
}

/** Revoca temporalmente los ADMIN_SISTEMA del personal para probar el bootstrap. Devuelve cómo restaurarlos. */
async function sinAdministradoresDelPersonal(): Promise<() => Promise<void>> {
  const db = getAdminDb();
  const { data } = await db
    .from("user_roles")
    .select("id, users!user_roles_user_id_fkey(user_identities(provider))")
    .eq("role_code", "ADMIN_SISTEMA")
    .is("revoked_at", null)
    .returns<{ id: number; users: { user_identities: { provider: string }[] } | null }[]>();
  const ids = (data ?? []).filter((r) => r.users?.user_identities.some((i) => i.provider === "ENTRA")).map((r) => r.id);
  if (ids.length) await db.from("user_roles").update({ revoked_at: new Date().toISOString() }).in("id", ids);
  return async () => {
    if (ids.length) await db.from("user_roles").update({ revoked_at: null }).in("id", ids);
  };
}

let restaurar: (() => Promise<void>) | undefined;
afterEach(async () => {
  await restaurar?.();
  restaurar = undefined;
});

describe("alta just-in-time del personal", () => {
  it("crea la cuenta SIN roles (no recibe CLIENTE) y lo audita", async () => {
    const id = personal();
    const primero = await upsertStaffFromLogin(id, { bootstrapAdmin: false }, ctx);
    expect(primero).toMatchObject({ created: true, bootstrapped: false, status: "ACTIVO" });

    const user = await loadUser(primero.userId);
    expect(user?.roles).toEqual([]);
    expect(user?.email).toBe(id.email);
    expect(await auditoria("STAFF_FIRST_LOGIN", primero.userId)).toHaveLength(1);

    const { data: identidades } = await getAdminDb()
      .from("user_identities")
      .select("provider, sub")
      .eq("user_id", primero.userId);
    expect(identidades).toEqual([{ provider: "ENTRA", sub: id.sub }]);
  });

  it("en ingresos posteriores actualiza nombre y correo desde el directorio", async () => {
    const id = personal();
    const { userId } = await upsertStaffFromLogin(id, { bootstrapAdmin: false }, ctx);
    const segundo = await upsertStaffFromLogin(
      { ...id, email: "nuevo@gad.test", displayName: "Nombre Nuevo" },
      { bootstrapAdmin: false },
      ctx,
    );
    expect(segundo).toMatchObject({ userId, created: false });
    expect(await loadUser(userId)).toMatchObject({ email: "nuevo@gad.test", displayName: "Nombre Nuevo" });
  });

  it("no acepta una identidad de Cognito por el camino del personal", async () => {
    const id = ciudadano();
    await upsertUserFromLogin(id);
    await expect(
      upsertStaffFromLogin({ ...id, provider: "ENTRA" }, { bootstrapAdmin: false }, ctx),
    ).rejects.toMatchObject({ message: expect.stringMatching(/no pertenece al personal/) });
  });
});

describe("bootstrap del primer ADMIN_SISTEMA", () => {
  it("se asigna solo si ninguna cuenta del personal es ADMIN_SISTEMA, con auditoría", async () => {
    restaurar = await sinAdministradoresDelPersonal();

    const primero = await upsertStaffFromLogin(personal(), { bootstrapAdmin: true }, ctx);
    expect(primero.bootstrapped).toBe(true);
    expect((await loadUser(primero.userId))?.roles).toEqual(["ADMIN_SISTEMA"]);
    const [evento] = await auditoria("ROLE_GRANTED", primero.userId);
    expect(evento).toMatchObject({ actor_id: null, metadata: { role: "ADMIN_SISTEMA", bootstrap: true } });

    // Ya hay un administrador del personal: la variable de bootstrap deja de tener efecto.
    const segundo = await upsertStaffFromLogin(personal(), { bootstrapAdmin: true }, ctx);
    expect(segundo.bootstrapped).toBe(false);
    expect((await loadUser(segundo.userId))?.roles).toEqual([]);

    // Limpieza: el admin de esta prueba no debe afectar a otras.
    await getAdminDb()
      .from("user_roles")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", primero.userId);
  });

  it("sin la marca de bootstrap no asigna nada", async () => {
    restaurar = await sinAdministradoresDelPersonal();
    const r = await upsertStaffFromLogin(personal(), { bootstrapAdmin: false }, ctx);
    expect(r.bootstrapped).toBe(false);
  });

  it("un administrador ciudadano (Cognito) no cuenta como administrador del personal", async () => {
    restaurar = await sinAdministradoresDelPersonal();
    const { user } = await upsertUserFromLogin(ciudadano());
    await getAdminDb().from("user_roles").insert({ user_id: user.id, role_code: "ADMIN_SISTEMA" });
    const r = await upsertStaffFromLogin(personal(), { bootstrapAdmin: true }, ctx);
    expect(r.bootstrapped).toBe(true);
    await getAdminDb()
      .from("user_roles")
      .update({ revoked_at: new Date().toISOString() })
      .in("user_id", [user.id, r.userId]);
  });
});

describe("permisos según el origen de la sesión", () => {
  it("los roles internos solo valen en sesiones de Entra; los ciudadanos solo en Cognito", async () => {
    const { user } = await upsertUserFromLogin(ciudadano());
    await getAdminDb().from("user_roles").insert({ user_id: user.id, role_code: "ADMIN_SISTEMA" });

    const cognito = (await loadUser(user.id, { source: "COGNITO" })) as AppUser;
    expect(cognito.roles).toEqual(["CLIENTE"]);
    expect(cognito.permissions).not.toContain("admin.access");

    const entra = (await loadUser(user.id, { source: "ENTRA" })) as AppUser;
    expect(entra.roles).toEqual(["ADMIN_SISTEMA"]);
    expect(entra.permissions).toContain("admin.access");

    expect((await loadUser(user.id))?.roles).toEqual(["ADMIN_SISTEMA", "CLIENTE"]);
  });
});

describe("sesiones del personal", () => {
  it("registran el origen ENTRA y la identidad; exigen la identidad al crearse", async () => {
    const id = personal();
    const { userId } = await upsertStaffFromLogin(id, { bootstrapAdmin: false }, ctx);
    const tokens = { access_token: "at-entra", refresh_token: "rt-entra", expires_in: 3600 };

    await expect(createSession({ userId, tokens, maxAgeSeconds: 3600, source: "ENTRA" })).rejects.toThrow(
      /requiere la identidad/,
    );

    const { cookieValue } = await createSession({
      userId,
      tokens,
      maxAgeSeconds: 3600,
      source: "ENTRA",
      identity: { issuer: id.issuer, sub: id.sub },
    });
    const { data: fila } = await getAdminDb()
      .from("auth_sessions")
      .select("auth_source, tokens_enc")
      .eq("user_id", userId)
      .single();
    expect(fila?.auth_source).toBe("ENTRA");
    expect(fila?.tokens_enc).not.toContain("rt-entra");

    await expect(resolveSession(cookieValue)).resolves.toMatchObject({
      userId,
      source: "ENTRA",
      identity: { issuer: id.issuer, sub: id.sub },
    });
    await expect(destroySession(cookieValue)).resolves.toEqual({ userId, source: "ENTRA" });
    await expect(resolveSession(cookieValue)).resolves.toBeNull();
  });
});

describe("separación entre cuentas del personal y ciudadanas", () => {
  it("los roles internos solo se asignan a cuentas del personal", async () => {
    const admin = (await loadUser((await upsertStaffFromLogin(personal(), { bootstrapAdmin: false }, ctx)).userId))!;
    await getAdminDb().from("user_roles").insert({ user_id: admin.id, role_code: "ADMIN_SISTEMA" });
    const actor = (await loadUser(admin.id, { source: "ENTRA" }))!;

    const { user: vecino } = await upsertUserFromLogin(ciudadano());
    await expect(grantRole(actor, { userId: vecino.id, roleCode: "MODERADOR" }, ctx)).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/cuentas institucionales/),
    });

    const { userId: funcionario } = await upsertStaffFromLogin(personal(), { bootstrapAdmin: false }, ctx);
    await grantRole(actor, { userId: funcionario, roleCode: "MODERADOR" }, ctx);
    expect((await loadUser(funcionario, { source: "ENTRA" }))?.roles).toEqual(["MODERADOR"]);

    await getAdminDb().from("user_roles").update({ revoked_at: new Date().toISOString() }).eq("user_id", admin.id);
  });

  it("una cuenta del personal no vincula identidades de Cognito", async () => {
    const { userId } = await upsertStaffFromLogin(personal(), { bootstrapAdmin: false }, ctx);
    await expect(linkIdentity(userId, ciudadano(), ctx)).rejects.toMatchObject({ status: 422 });
  });

  it("una cuenta ciudadana no vincula identidades de Entra", async () => {
    const { user } = await upsertUserFromLogin(ciudadano());
    await expect(linkIdentity(user.id, personal(), ctx)).rejects.toMatchObject({ status: 422 });
  });

  it("una identidad de Cognito de una cuenta del personal no se fusiona (CONFLICT)", async () => {
    // Datos previos a la Fase 2B: una cuenta del personal con una identidad de Cognito.
    const { userId: staff } = await upsertStaffFromLogin(personal(), { bootstrapAdmin: false }, ctx);
    const cognitoDelPersonal = ciudadano();
    await getAdminDb().from("user_identities").insert({
      user_id: staff,
      issuer: cognitoDelPersonal.issuer,
      sub: cognitoDelPersonal.sub,
      provider: "COGNITO",
    });

    const { user } = await upsertUserFromLogin(ciudadano());
    await expect(linkIdentity(user.id, cognitoDelPersonal, ctx)).resolves.toBe("CONFLICT");
    expect((await loadUser(staff))?.status).toBe("ACTIVO");
  });
});
