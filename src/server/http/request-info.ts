import "server-only";

import { headers } from "next/headers";
import { z } from "zod";

export type RequestContext = { ip: string | null; userAgent: string | null; requestId: string | null };

/** Datos del request útiles para auditoría y logs. */
export function requestInfo(headers: Headers): RequestContext {
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

/** Contexto del request actual (Server Components y Server Actions). */
export async function currentRequestContext(): Promise<RequestContext> {
  return requestInfo(await headers());
}

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

/** IP válida para columnas/parámetros `inet`, o null. */
export function toInet(ip: string | null | undefined): string | null {
  return ip && ipSchema.safeParse(ip).success ? ip : null;
}

/** Parámetros comunes de auditoría para las funciones SQL `fn_*`. */
export function auditParams(ctx: RequestContext) {
  return { p_ip: toInet(ctx.ip), p_user_agent: ctx.userAgent?.slice(0, 512) ?? null, p_request_id: ctx.requestId };
}
