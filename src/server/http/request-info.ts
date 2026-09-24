import "server-only";

/** Datos del request útiles para auditoría y logs. */
export function requestInfo(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent"),
    requestId: headers.get("x-request-id"),
  };
}

/** Acepta solo rutas internas relativas para evitar open redirects (`//evil.com`, `https://…`). */
export function safeReturnTo(valor: string | null | undefined, porDefecto = "/cuenta"): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return porDefecto;
  if (valor.startsWith("/api/")) return porDefecto;
  return valor.length > 512 ? porDefecto : valor;
}
