import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthError } from "@/server/auth/authorize";
import { createSession, resolveSession } from "@/server/auth/session";
import {
  loadUser,
  upsertStaffFromLogin,
  upsertUserFromLogin,
  type AppUser,
  type IdentityClaims,
} from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { DomainError } from "@/server/errors";
import type { RequestContext } from "@/server/http/request-info";
import { getUserDetail, grantRole, revokeRole, searchUsers, setUserStatus } from "@/server/users/admin";
import { acceptCurrentConsents, getPendingConsents } from "@/server/users/consents";
import { linkIdentity, listIdentities, unlinkIdentity } from "@/server/users/identities";
import { getClientProfile, saveClientProfile } from "@/server/users/profile";

/** Integración de la Fase 2 contra Supabase local (`pnpm test:integration`). */

const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";
const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-test" };

function identidad(parcial: Partial<IdentityClaims> = {}): IdentityClaims {
  return { issuer: ISS, sub: randomUUID(), provider: "COGNITO", emailVerified: true, ...parcial };
}

async function nuevoUsuario(roles: string[] = [], parcial: Partial<IdentityClaims> = {}) {
  const id = identidad({ email: `${randomUUID()}@test.ec`, ...parcial });
  const { user } = await upsertUserFromLogin(id);
  for (const role_code of roles) await getAdminDb().from("user_roles").insert({ user_id: user.id, role_code });
  return { user: (await loadUser(user.id)) as AppUser, identity: id };
}

/** Cuenta del personal (Entra ID, ADR-012): la única que puede recibir roles internos. */
async function nuevoPersonal() {
  const { userId } = await upsertStaffFromLogin(
    {
      issuer: "https://login.microsoftonline.com/00000000-0000-4000-8000-000000000001/v2.0",
      sub: randomUUID(),
      provider: "ENTRA",
      emailVerified: false,
    },
    { bootstrapAdmin: false },
    ctx,
  );
  return (await loadUser(userId)) as AppUser;
}

async function auditoria(action: string, resourceId: string) {
  const { data } = await getAdminDb()
    .from("audit_log")
    .select("action, actor_id, metadata, ip")
    .eq("action", action)
    .eq("resource_id", resourceId);
  return data ?? [];
}

describe("consentimiento (RN-18)", () => {
  it("un usuario nuevo tiene TERMINOS y PRIVACIDAD pendientes; al aceptar quedan registrados y auditados", async () => {
    const { user } = await nuevoUsuario();
    expect((await getPendingConsents(user.id)).map((d) => d.code).sort()).toEqual(["PRIVACIDAD", "TERMINOS"]);

    await expect(acceptCurrentConsents(user.id, ctx)).resolves.toBe(2);
    await expect(getPendingConsents(user.id)).resolves.toEqual([]);
    await expect(acceptCurrentConsents(user.id, ctx)).resolves.toBe(0); // idempotente

    const eventos = await auditoria("CONSENT_ACCEPTED", user.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].ip).toBe("190.1.2.3");
  });

  it("una nueva versión publicada vuelve a quedar pendiente", async () => {
    const { user } = await nuevoUsuario();
    await acceptCurrentConsents(user.id, ctx);
    const db = getAdminDb();
    const { data: max } = await db
      .from("legal_documents")
      .select("version")
      .eq("code", "TERMINOS")
      .order("version", { ascending: false })
      .limit(1)
      .single();
    const version = (max!.version as number) + 1;
    const { error } = await db.from("legal_documents").insert({
      code: "TERMINOS",
      version,
      title: "Términos v" + version,
      content_md: "Texto de prueba de los términos, versión nueva.", // la base exige 20 caracteres o más
      published_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
    expect((await getPendingConsents(user.id)).map((d) => `${d.code}@${d.version}`)).toEqual([`TERMINOS@${version}`]);
  });
});

describe("perfil de cliente", () => {
  it("guarda, normaliza y audita", async () => {
    const { user } = await nuevoUsuario();
    await saveClientProfile(
      user.id,
      { fullName: "  Ana   Pérez ", phone: "099-123 4567", sector: "Huachi Chico" },
      ctx,
    );
    await expect(getClientProfile(user.id)).resolves.toMatchObject({ fullName: "Ana Pérez", phone: "0991234567" });
    expect((await loadUser(user.id))?.displayName).toBe("Ana Pérez");
    expect(await auditoria("PROFILE_UPDATED", user.id)).toHaveLength(1);
  });

  it("rechaza teléfonos inválidos", async () => {
    const { user } = await nuevoUsuario();
    await expect(saveClientProfile(user.id, { fullName: "Ana Pérez", phone: "12345" }, ctx)).rejects.toThrow(/celular/);
  });
});

describe("administración de roles", () => {
  it("un ADMIN_SISTEMA asigna y revoca roles internos con auditoría atómica", async () => {
    const { user: admin } = await nuevoUsuario(["ADMIN_SISTEMA"]);
    const objetivo = await nuevoPersonal();

    await grantRole(admin, { userId: objetivo.id, roleCode: "MODERADOR" }, ctx);
    expect((await loadUser(objetivo.id))?.roles).toContain("MODERADOR");
    await expect(grantRole(admin, { userId: objetivo.id, roleCode: "MODERADOR" }, ctx)).rejects.toMatchObject({
      status: 409,
    });

    await revokeRole(admin, { userId: objetivo.id, roleCode: "MODERADOR" }, ctx);
    expect((await loadUser(objetivo.id))?.roles).not.toContain("MODERADOR");

    const [concedido] = await auditoria("ROLE_GRANTED", objetivo.id);
    expect(concedido).toMatchObject({ actor_id: admin.id, metadata: { role: "MODERADOR" } });
    expect(await auditoria("ROLE_REVOKED", objetivo.id)).toHaveLength(1);
  });

  it("no permite asignar roles no internos", async () => {
    const { user: admin } = await nuevoUsuario(["ADMIN_SISTEMA"]);
    const { user: objetivo } = await nuevoUsuario();
    await expect(grantRole(admin, { userId: objetivo.id, roleCode: "TRABAJADOR" }, ctx)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("sin permiso: la app responde 403 y la función SQL también (defensa en profundidad)", async () => {
    const { user: cliente } = await nuevoUsuario();
    const { user: objetivo } = await nuevoUsuario();
    await expect(grantRole(cliente, { userId: objetivo.id, roleCode: "MODERADOR" }, ctx)).rejects.toBeInstanceOf(
      AuthError,
    );

    const { error } = await getAdminDb().rpc("fn_admin_grant_role", {
      p_actor_id: cliente.id,
      p_user_id: objetivo.id,
      p_role_code: "ADMIN_SISTEMA",
    });
    expect(error?.code).toBe("42501");
  });

  it("no permite revocar el último ADMIN_SISTEMA activo", async () => {
    const db = getAdminDb();
    const { user: admin } = await nuevoUsuario(["ADMIN_SISTEMA"]);
    // Deja a `admin` como único ADMIN_SISTEMA activo durante la prueba.
    const { data: otros } = await db
      .from("user_roles")
      .select("id")
      .eq("role_code", "ADMIN_SISTEMA")
      .is("revoked_at", null)
      .neq("user_id", admin.id);
    const ids = (otros ?? []).map((r) => r.id as number);
    if (ids.length) await db.from("user_roles").update({ revoked_at: new Date().toISOString() }).in("id", ids);
    try {
      await expect(revokeRole(admin, { userId: admin.id, roleCode: "ADMIN_SISTEMA" }, ctx)).rejects.toThrow(
        /último ADMIN_SISTEMA/,
      );
    } finally {
      if (ids.length) await db.from("user_roles").update({ revoked_at: null }).in("id", ids);
    }
  });
});

describe("bloqueo de usuarios", () => {
  it("bloquear revoca las sesiones; desbloquear las permite de nuevo", async () => {
    const { user: admin } = await nuevoUsuario(["ADMIN_SISTEMA"]);
    const { user: objetivo } = await nuevoUsuario();
    const { cookieValue } = await createSession({
      userId: objetivo.id,
      tokens: { access_token: "at", expires_in: 3600, token_type: "Bearer" },
      maxAgeSeconds: 3600,
    });

    await setUserStatus(admin, { userId: objetivo.id, status: "BLOQUEADO", reason: "Denuncia comprobada" }, ctx);
    expect((await loadUser(objetivo.id))?.status).toBe("BLOQUEADO");
    await expect(resolveSession(cookieValue)).resolves.toBeNull();
    expect((await getUserDetail(admin, objetivo.id)).blockedReason).toBe("Denuncia comprobada");

    await setUserStatus(admin, { userId: objetivo.id, status: "ACTIVO" }, ctx);
    expect((await loadUser(objetivo.id))?.status).toBe("ACTIVO");
    expect(await auditoria("USER_BLOCKED", objetivo.id)).toHaveLength(1);
    expect(await auditoria("USER_UNBLOCKED", objetivo.id)).toHaveLength(1);
  });

  it("exige motivo, impide el auto-bloqueo y protege al personal interno", async () => {
    const { user: admin } = await nuevoUsuario(["ADMIN_SISTEMA"]);
    const { user: denuncias } = await nuevoUsuario(["RESP_DENUNCIAS"]);
    const { user: moderador } = await nuevoUsuario(["MODERADOR"]);
    const { user: cliente } = await nuevoUsuario();

    await expect(setUserStatus(admin, { userId: cliente.id, status: "BLOQUEADO" }, ctx)).rejects.toThrow();
    await expect(
      setUserStatus(admin, { userId: admin.id, status: "BLOQUEADO", reason: "prueba propia" }, ctx),
    ).rejects.toMatchObject({ status: 422 });
    // RESP_DENUNCIAS puede bloquear ciudadanos, pero no a personal interno (requiere role.manage).
    await setUserStatus(denuncias, { userId: cliente.id, status: "BLOQUEADO", reason: "Spam reiterado" }, ctx);
    await expect(
      setUserStatus(denuncias, { userId: moderador.id, status: "BLOQUEADO", reason: "Motivo x" }, ctx),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("vinculación de identidades (ADR-008)", () => {
  it("vincula una identidad nueva y reconoce la ya vinculada", async () => {
    const { user } = await nuevoUsuario();
    const google = identidad({ provider: "Google" });
    await expect(linkIdentity(user.id, google, ctx)).resolves.toBe("LINKED");
    await expect(linkIdentity(user.id, google, ctx)).resolves.toBe("ALREADY_LINKED");
    expect((await listIdentities(user.id)).map((i) => i.provider).sort()).toEqual(["COGNITO", "Google"]);
  });

  it("fusiona una cuenta vacía creada con el otro proveedor", async () => {
    const { user } = await nuevoUsuario();
    const { user: vacia, identity: googleId } = await nuevoUsuario([], { provider: "Google" });
    const { cookieValue } = await createSession({
      userId: vacia.id,
      tokens: { access_token: "at", expires_in: 3600, token_type: "Bearer" },
      maxAgeSeconds: 3600,
    });

    await expect(linkIdentity(user.id, googleId, ctx)).resolves.toBe("MERGED");
    expect((await loadUser(vacia.id))?.status).toBe("ELIMINADO");
    await expect(resolveSession(cookieValue)).resolves.toBeNull();
    expect((await listIdentities(user.id)).map((i) => i.provider).sort()).toEqual(["COGNITO", "Google"]);
    expect(await auditoria("USER_MERGED", vacia.id)).toHaveLength(1);
  });

  it("no fusiona si la otra cuenta tiene datos (CONFLICT)", async () => {
    const { user } = await nuevoUsuario();
    const { user: conDatos, identity: googleId } = await nuevoUsuario([], { provider: "Google" });
    await saveClientProfile(conDatos.id, { fullName: "Otra Persona" }, ctx);
    await expect(linkIdentity(user.id, googleId, ctx)).resolves.toBe("CONFLICT");
    expect((await loadUser(conDatos.id))?.status).toBe("ACTIVO");
  });

  it("desvincular: no la identidad en uso ni la última", async () => {
    const { user, identity } = await nuevoUsuario();
    const [unica] = await listIdentities(user.id);
    await expect(unlinkIdentity(user.id, unica.id, { issuer: "otro", sub: "otro" }, ctx)).rejects.toThrow(
      /al menos una/,
    );

    await linkIdentity(user.id, identidad({ provider: "Google" }), ctx);
    const google = (await listIdentities(user.id)).find((i) => i.provider === "Google")!;
    await expect(unlinkIdentity(user.id, unica.id, identity, ctx)).rejects.toBeInstanceOf(DomainError);
    await unlinkIdentity(user.id, google.id, identity, ctx);
    expect(await listIdentities(user.id)).toHaveLength(1);
  });
});

describe("búsqueda de usuarios", () => {
  it("filtra por email o nombre y tolera caracteres especiales", async () => {
    const { user: admin } = await nuevoUsuario(["ADMIN_SISTEMA"]);
    const marca = randomUUID().slice(0, 8);
    const { user } = await nuevoUsuario([], { email: `busqueda-${marca}@test.ec` });
    const r = await searchUsers(admin, { q: marca });
    expect(r.items.map((u) => u.id)).toEqual([user.id]);
    await expect(searchUsers(admin, { q: '100%_,()"' })).resolves.toMatchObject({ page: 1 });
  });

  it("requiere user.read", async () => {
    const { user: cliente } = await nuevoUsuario();
    await expect(searchUsers(cliente, {})).rejects.toBeInstanceOf(AuthError);
  });
});
