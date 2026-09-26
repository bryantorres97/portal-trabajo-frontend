import "server-only";

import { z } from "zod";

import { getSessionEnv } from "@/lib/env";
import { hmacHex } from "@/server/auth/crypto";
import { requirePermission, requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import {
  activationExpiry,
  generateActivationCode,
  normalizeActivationCode,
} from "@/server/domain/workers/activation-code";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

/**
 * Código de activación (vinculación de la cuenta ciudadana con la ficha del trabajador).
 * El código en claro solo se muestra una vez al operador; la base guarda su HMAC-SHA256.
 */

async function hashCode(code: string): Promise<string> {
  return hmacHex(code, getSessionEnv().SESSION_SECRET, "activation-code");
}

export async function issueActivationCode(
  actor: AppUser,
  workerId: string,
  ctx: RequestContext,
): Promise<{ code: string; expiresAt: string }> {
  requirePermission(actor, "worker.activation_code");
  z.uuid().parse(workerId);
  const code = generateActivationCode();
  const expiresAt = activationExpiry().toISOString();
  const { error } = await getAdminDb().rpc("fn_admin_issue_activation_code", {
    p_actor_id: actor.id,
    p_worker_id: workerId,
    p_code_hash: await hashCode(code),
    p_expires_at: expiresAt,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return { code, expiresAt };
}

export type RedeemResult = "LINKED" | "ALREADY_WORKER";

const mensajes: Record<string, [400 | 409 | 422 | 429, string]> = {
  INVALID: [422, "El código no es válido. Revísalo e inténtalo de nuevo."],
  EXPIRED: [422, "El código ya no está vigente. Pide uno nuevo en el punto de atención del GAD."],
  RATE_LIMITED: [429, "Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentarlo."],
};

/** Canje por el propio trabajador desde su cuenta ciudadana (sesión de Cognito). */
export async function redeemActivationCode(
  user: AppUser,
  rawCode: unknown,
  ctx: RequestContext,
): Promise<{ result: RedeemResult; workerId: string }> {
  requireUser(user);
  const code = normalizeActivationCode(typeof rawCode === "string" ? rawCode : "");
  if (!code) throw new DomainError(422, "El código tiene 8 caracteres (letras y números), por ejemplo ABCD-2345.");
  const { data, error } = await getAdminDb()
    .rpc("fn_redeem_activation_code", { p_user_id: user.id, p_code_hash: await hashCode(code), ...auditParams(ctx) })
    .single<{ result: string; worker_id: string | null }>();
  if (error) throwPg(error);
  const falla = mensajes[data.result];
  if (falla) throw new DomainError(falla[0], falla[1], data.result.toLowerCase());
  return { result: data.result as RedeemResult, workerId: data.worker_id! };
}
