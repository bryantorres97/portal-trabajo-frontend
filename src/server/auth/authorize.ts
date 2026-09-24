import type { AppUser } from "@/server/auth/users";

/**
 * Autorización de negocio (ADR-006). Se decide por PERMISO, nunca comparando nombres de rol.
 * Las verificaciones de propiedad/estado del recurso se agregan en cada caso de uso del dominio.
 */

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function isActive(user: AppUser | null): user is AppUser {
  return !!user && user.status === "ACTIVO";
}

export function hasPermission(user: AppUser | null, permission: string): boolean {
  return isActive(user) && user.permissions.includes(permission);
}

/** Lanza 401 si no hay usuario activo, 403 si le falta el permiso. */
export function requirePermission(user: AppUser | null, permission: string): AppUser {
  if (!user) throw new AuthError(401, "Se requiere iniciar sesión");
  if (!isActive(user)) throw new AuthError(403, "La cuenta no está activa");
  if (!user.permissions.includes(permission)) throw new AuthError(403, `Permiso requerido: ${permission}`);
  return user;
}

export function requireUser(user: AppUser | null): AppUser {
  if (!user) throw new AuthError(401, "Se requiere iniciar sesión");
  if (!isActive(user)) throw new AuthError(403, "La cuenta no está activa");
  return user;
}
