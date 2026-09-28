import "server-only";

import type { IdentityClaims } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

export type LinkedIdentity = {
  id: number;
  issuer: string;
  sub: string;
  provider: string;
  email: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type LinkResult = "LINKED" | "ALREADY_LINKED" | "MERGED" | "CONFLICT";

export async function listIdentities(userId: string): Promise<LinkedIdentity[]> {
  const { data, error } = await getAdminDb()
    .from("user_identities")
    .select("id, issuer, sub, provider, email, created_at, last_login_at")
    .eq("user_id", userId)
    .order("created_at")
    .returns<
      {
        id: number;
        issuer: string;
        sub: string;
        provider: string;
        email: string | null;
        created_at: string;
        last_login_at: string | null;
      }[]
    >();
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    issuer: i.issuer,
    sub: i.sub,
    provider: i.provider,
    email: i.email,
    createdAt: i.created_at,
    lastLoginAt: i.last_login_at,
  }));
}

/**
 * Vincula a `userId` una identidad recién autenticada (el usuario probó que es titular al
 * iniciar sesión con ella). Si la identidad pertenece a otra cuenta sin datos propios, la
 * fusiona; si esa cuenta tiene datos, devuelve CONFLICT (ADR-008).
 */
export async function linkIdentity(userId: string, identity: IdentityClaims, ctx: RequestContext): Promise<LinkResult> {
  const { data, error } = await getAdminDb().rpc("fn_link_identity", {
    p_user_id: userId,
    p_issuer: identity.issuer,
    p_sub: identity.sub,
    p_provider: identity.provider,
    p_email: identity.email ?? null,
    p_email_verified: identity.emailVerified,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as LinkResult;
}

/** Desvincula una identidad. No se permite quitar la identidad con la que se inició la sesión actual. */
export async function unlinkIdentity(
  userId: string,
  identityId: number,
  current: { issuer: string; sub: string },
  ctx: RequestContext,
): Promise<void> {
  const identidades = await listIdentities(userId);
  const objetivo = identidades.find((i) => i.id === identityId);
  if (!objetivo) throw new DomainError(404, "Forma de ingreso no encontrada");
  if (objetivo.issuer === current.issuer && objetivo.sub === current.sub) {
    throw new DomainError(422, "No puedes quitar la forma de ingreso que estás usando ahora");
  }
  const { error } = await getAdminDb().rpc("fn_unlink_identity", {
    p_user_id: userId,
    p_identity_id: identityId,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}
