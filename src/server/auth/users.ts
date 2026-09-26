import "server-only";

import type { AuthSource } from "@/server/auth/session";
import { getAdminDb } from "@/server/db/admin";
import { auditParams, type RequestContext } from "@/server/http/request-info";

export type UserStatus = "ACTIVO" | "BLOQUEADO" | "ELIMINADO";

export type AppUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  status: UserStatus;
  roles: string[];
  permissions: string[];
};

/**
 * Identidad verificada. En Cognito, `sub` NO es estable entre proveedores de login (ADR-008);
 * en Entra ID, `sub` guarda el `oid` del personal (ADR-012).
 */
export type IdentityClaims = {
  issuer: string;
  sub: string;
  provider: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
};

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: UserStatus;
};

const USER_COLUMNS = "id, email, display_name, status";

/**
 * Extrae la identidad de los claims de un ID token de Cognito ya verificado.
 * - Los usuarios federados (Google, Facebook) traen el claim `identities` con `providerName`.
 * - El pool del GAD entrega `given_name`/`family_name` (no `name`) y NO entrega teléfono ni cédula.
 */
export function identityFromIdToken(claims: Record<string, unknown>): IdentityClaims {
  const identities = Array.isArray(claims.identities) ? claims.identities : [];
  const federado = identities[0] as { providerName?: unknown } | undefined;
  const provider = typeof federado?.providerName === "string" ? federado.providerName : "COGNITO";
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
  const nombres = [texto(claims.given_name), texto(claims.family_name)].filter(Boolean).join(" ");

  return {
    issuer: String(claims.iss),
    sub: String(claims.sub),
    provider: provider.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "COGNITO",
    email: texto(claims.email)?.toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    displayName: (nombres || texto(claims.name))?.slice(0, 120),
  };
}

/**
 * Alta just-in-time: resuelve la identidad (issuer + sub) y, si no existe, crea un usuario
 * nuevo con rol CLIENTE. No vincula automáticamente identidades por email (ADR-008): la
 * vinculación entre proveedores se diseña en la Fase 2 con confirmación explícita.
 */
export async function upsertUserFromLogin(identity: IdentityClaims): Promise<{ user: UserRow; created: boolean }> {
  const db = getAdminDb();
  const ahora = new Date().toISOString();

  const { data: existente, error: errorBusqueda } = await db
    .from("user_identities")
    .select("id, user_id")
    .eq("issuer", identity.issuer)
    .eq("sub", identity.sub)
    .maybeSingle<{ id: number; user_id: string }>();
  if (errorBusqueda) throw errorBusqueda;

  if (existente) {
    const { error: errorIdentidad } = await db
      .from("user_identities")
      .update({ email: identity.email ?? null, email_verified: identity.emailVerified, last_login_at: ahora })
      .eq("id", existente.id);
    if (errorIdentidad) throw errorIdentidad;

    const { data: previo, error: errorPrevio } = await db
      .from("users")
      .select(USER_COLUMNS)
      .eq("id", existente.user_id)
      .single<UserRow>();
    if (errorPrevio) throw errorPrevio;

    const { data, error } = await db
      .from("users")
      .update({
        // Solo se actualiza el email del usuario con un email verificado.
        ...(identity.email && identity.emailVerified ? { email: identity.email, email_verified: true } : {}),
        display_name: previo.display_name ?? identity.displayName ?? null,
        last_login_at: ahora,
      })
      .eq("id", existente.user_id)
      .select(USER_COLUMNS)
      .single<UserRow>();
    if (error) throw error;
    return { user: data, created: false };
  }

  const { data: creado, error: errorAlta } = await db
    .from("users")
    .insert({
      email: identity.email ?? null,
      email_verified: identity.emailVerified,
      display_name: identity.displayName ?? null,
      last_login_at: ahora,
    })
    .select(USER_COLUMNS)
    .single<UserRow>();
  if (errorAlta) throw errorAlta;

  const { error: errorIdentidad } = await db.from("user_identities").insert({
    user_id: creado.id,
    issuer: identity.issuer,
    sub: identity.sub,
    provider: identity.provider,
    email: identity.email ?? null,
    email_verified: identity.emailVerified,
    last_login_at: ahora,
  });
  if (errorIdentidad) throw errorIdentidad;

  const { error: errorRol } = await db.from("user_roles").insert({ user_id: creado.id, role_code: "CLIENTE" });
  if (errorRol) throw errorRol;

  return { user: creado, created: true };
}

/** Devuelve el id del usuario dueño de una identidad (issuer + sub), o null. */
export async function findUserIdByIdentity(issuer: string, sub: string): Promise<string | null> {
  const { data, error } = await getAdminDb()
    .from("user_identities")
    .select("user_id")
    .eq("issuer", issuer)
    .eq("sub", sub)
    .maybeSingle<{ user_id: string }>();
  if (error) throw error;
  return data?.user_id ?? null;
}

/**
 * Carga el usuario con sus roles vigentes y permisos efectivos.
 * Con `source`, solo cuentan los roles que valen en ese tipo de sesión (ADR-012): los internos
 * en sesiones de Entra ID y los ciudadanos en sesiones de Cognito. Sin `source` (vistas
 * administrativas de otras cuentas) se devuelven todos.
 */
export async function loadUser(id: string, opts: { source?: AuthSource } = {}): Promise<AppUser | null> {
  const db = getAdminDb();
  const { data: user, error } = await db.from("users").select(USER_COLUMNS).eq("id", id).maybeSingle<UserRow>();
  if (error) throw error;
  if (!user) return null;

  const { data, error: errorRoles } = await db
    .from("user_roles")
    .select("role_code, roles(is_internal, role_permissions(permission_code))")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .returns<
      {
        role_code: string;
        roles: { is_internal: boolean; role_permissions: { permission_code: string }[] } | null;
      }[]
    >();
  if (errorRoles) throw errorRoles;

  const roles = (data ?? []).filter(
    (r) => !opts.source || (r.roles?.is_internal ?? false) === (opts.source === "ENTRA"),
  );
  const permisos = new Set<string>();
  for (const r of roles) {
    for (const rp of r.roles?.role_permissions ?? []) permisos.add(rp.permission_code);
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    status: user.status,
    roles: roles.map((r) => r.role_code).sort(),
    permissions: [...permisos].sort(),
  };
}

/**
 * Ingreso del personal con Entra ID (ADR-012), atómico en `fn_staff_login`: alta just-in-time
 * SIN roles (no reciben CLIENTE) y, si `bootstrapAdmin` y aún no hay administradores del
 * personal, asignación auditada del primer ADMIN_SISTEMA.
 */
export async function upsertStaffFromLogin(
  identity: IdentityClaims,
  opts: { bootstrapAdmin: boolean },
  ctx: RequestContext,
): Promise<{ userId: string; created: boolean; bootstrapped: boolean; status: UserStatus }> {
  const { data, error } = await getAdminDb()
    .rpc("fn_staff_login", {
      p_issuer: identity.issuer,
      p_sub: identity.sub,
      p_email: identity.email ?? null,
      p_display_name: identity.displayName ?? null,
      p_bootstrap_admin: opts.bootstrapAdmin,
      ...auditParams(ctx),
    })
    .single<{ user_id: string; created: boolean; bootstrapped: boolean; status: UserStatus }>();
  if (error) throw error;
  return { userId: data.user_id, created: data.created, bootstrapped: data.bootstrapped, status: data.status };
}
