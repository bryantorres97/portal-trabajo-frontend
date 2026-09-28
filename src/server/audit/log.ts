import "server-only";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { getAdminDb } from "@/server/db/admin";

/** Catálogo inicial de acciones (docs/analysis/05-seguridad-auditoria.md §19). Se amplía por fase. */
export type AuditAction =
  "USER_FIRST_LOGIN" | "USER_LOGIN" | "USER_LOGOUT" | "USER_LOGIN_FAILED" | "ACCESS_DENIED" | (string & {});

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  actorRoles?: string[];
  resourceType?: string;
  resourceId?: string;
  result?: "SUCCESS" | "DENIED" | "ERROR";
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

const actionSchema = z.string().regex(/^[A-Z][A-Z_]*$/, "Acción de auditoría inválida");

/** Convierte una entrada de auditoría en la fila de `audit_log`. */
export function toAuditRow(entry: AuditEntry) {
  return {
    action: actionSchema.parse(entry.action),
    actor_id: entry.actorId ?? null,
    actor_roles: entry.actorRoles ?? [],
    resource_type: entry.resourceType ?? null,
    resource_id: entry.resourceId ?? null,
    result: entry.result ?? "SUCCESS",
    ip: entry.ip && z.union([z.ipv4(), z.ipv6()]).safeParse(entry.ip).success ? entry.ip : null,
    user_agent: entry.userAgent ? entry.userAgent.slice(0, 512) : null,
    request_id: entry.requestId ?? null,
    metadata: entry.metadata ?? {},
  };
}

/**
 * Registra una acción en la auditoría inmutable.
 * Las acciones administrativas críticas deben usar, a partir de la Fase 2, funciones SQL
 * que escriban el cambio y la auditoría en la misma transacción; esta función cubre el resto.
 * Si la escritura falla, se lanza el error: una acción auditable no debe continuar sin registro.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await getAdminDb().from("audit_log").insert(toAuditRow(entry));
  if (error) {
    logger.error("audit.write_failed", { action: entry.action, error: error.message });
    throw new Error(`No se pudo registrar la auditoría (${entry.action})`);
  }
}
