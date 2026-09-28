/**
 * Nombres y opciones de cookies de autenticación. Sin dependencias de servidor
 * para poder usarse también desde `proxy.ts`.
 */

const esProduccion = process.env.NODE_ENV === "production";

/** En producción se usa el prefijo `__Host-` (exige Secure, Path=/ y sin Domain). */
export const SESSION_COOKIE = esProduccion ? "__Host-acolita_session" : "acolita_session";

/** Cookie temporal con state/nonce/PKCE durante el login. */
export const OAUTH_COOKIE = esProduccion ? "__Host-acolita_oauth" : "acolita_oauth";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días (ciudadanos)
export const INTERNAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 h (personal GAD)
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: esProduccion,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Propósito de derivación de clave para la cookie temporal del flujo OAuth. */
export const OAUTH_PURPOSE = "oauth-state";
