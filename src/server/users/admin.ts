import "server-only";

import { requirePermission } from "@/server/auth/authorize";
import { revokeEncryptedTokens } from "@/server/auth/session";
import type { AppUser, UserStatus } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { roleChangeSchema, statusChangeSchema, userSearchSchema } from "@/server/domain/users/schemas";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

/**
 * Administración de usuarios del portal (Fase 2). Cada caso de uso verifica el permiso en la
 * aplicación y, de nuevo, en la función SQL (defensa en profundidad). La auditoría se escribe
 * en la misma transacción que el cambio.
 */

export const PAGE_SIZE = 20;

export type UserListItem = {
  id: string;
  email: string | null;
  displayName: string | null;
  status: UserStatus;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
};

export type RoleOption = { code: string; name: string; description: string | null };

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
  blocked_reason?: string | null;
  user_roles: { role_code: string; revoked_at: string | null }[];
};

function mapUser(u: UserRow): UserListItem {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    status: u.status,
    roles: u.user_roles
      .filter((r) => !r.revoked_at)
      .map((r) => r.role_code)
      .sort(),
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
  };
}

/** Escapa comodines de ILIKE y caracteres especiales del filtro `or` de PostgREST. */
function patronBusqueda(q: string): string {
  return `%${q.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ")}%`;
}

export async function searchUsers(actor: AppUser, params: { q?: string; page?: number }) {
  requirePermission(actor, "user.read");
  const { q, page } = userSearchSchema.parse(params);
  let query = getAdminDb()
    .from("users")
    .select(
      "id, email, display_name, status, last_login_at, created_at, user_roles!user_roles_user_id_fkey(role_code, revoked_at)",
      {
        count: "exact",
      },
    )
    .neq("status", "ELIMINADO")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) {
    const p = patronBusqueda(q);
    query = query.or(`email.ilike.${p},display_name.ilike.${p}`);
  }
  const { data, error, count } = await query.returns<UserRow[]>();
  if (error) throw error;
  return { items: (data ?? []).map(mapUser), total: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function getUserDetail(actor: AppUser, userId: string) {
  requirePermission(actor, "user.read");
  const { data, error } = await getAdminDb()
    .from("users")
    .select(
      "id, email, display_name, status, blocked_reason, last_login_at, created_at, user_roles!user_roles_user_id_fkey(role_code, revoked_at), user_identities(provider, created_at, last_login_at)",
    )
    .eq("id", userId)
    .maybeSingle<
      UserRow & { user_identities: { provider: string; created_at: string; last_login_at: string | null }[] }
    >();
  if (error) throw error;
  if (!data) throw new DomainError(404, "Usuario no encontrado");
  return {
    ...mapUser(data),
    blockedReason: data.blocked_reason ?? null,
    identities: data.user_identities.map((i) => ({
      provider: i.provider,
      createdAt: i.created_at,
      lastLoginAt: i.last_login_at,
    })),
  };
}

export async function listInternalRoles(): Promise<RoleOption[]> {
  const { data, error } = await getAdminDb()
    .from("roles")
    .select("code, name, description")
    .eq("is_internal", true)
    .order("name")
    .returns<RoleOption[]>();
  if (error) throw error;
  return data ?? [];
}

export async function grantRole(actor: AppUser, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "role.manage");
  const { userId, roleCode } = roleChangeSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_admin_grant_role", {
    p_actor_id: actor.id,
    p_user_id: userId,
    p_role_code: roleCode,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

export async function revokeRole(actor: AppUser, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "role.manage");
  const { userId, roleCode } = roleChangeSchema.parse(input);
  const { error } = await getAdminDb().rpc("fn_admin_revoke_role", {
    p_actor_id: actor.id,
    p_user_id: userId,
    p_role_code: roleCode,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

/** Bloquea o desbloquea. Al bloquear, revoca las sesiones del portal y los refresh tokens en Cognito. */
export async function setUserStatus(actor: AppUser, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "user.block");
  const { userId, status, reason } = statusChangeSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_admin_set_user_status", {
    p_actor_id: actor.id,
    p_user_id: userId,
    p_status: status,
    p_reason: reason ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  await revokeEncryptedTokens((data as string[] | null) ?? []);
}
