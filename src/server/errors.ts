/**
 * Errores de dominio con estado HTTP asociado. Los casos de uso lanzan DomainError;
 * la capa HTTP (API y Server Actions) los traduce a respuestas o mensajes para el usuario.
 */
export class DomainError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422,
    message: string,
    readonly code: string = "domain_error",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

type PgError = { code?: string; message?: string } | null | undefined;

/**
 * Traduce errores de Postgres/PostgREST de las funciones `fn_*` (que usan errcodes estándar)
 * a DomainError con el mensaje en español definido en la función SQL.
 */
export function fromPgError(error: PgError): DomainError | null {
  if (!error?.code) return null;
  const mensaje = error.message ?? "Operación no permitida";
  switch (error.code) {
    case "42501": // insufficient_privilege
      return new DomainError(403, mensaje, "forbidden");
    case "P0002": // no_data_found
      return new DomainError(404, mensaje, "not_found");
    case "23505": // unique_violation
      return new DomainError(409, mensaje, "conflict");
    case "23514": // check_violation
    case "22P02": // invalid_text_representation (enum/uuid inválido)
      return new DomainError(422, mensaje, "invalid");
    default:
      return null;
  }
}

/** Lanza el DomainError equivalente, o el error original si no es de dominio. */
export function throwPg(error: PgError): never {
  throw fromPgError(error) ?? Object.assign(new Error(error?.message ?? "Error de base de datos"), { cause: error });
}
