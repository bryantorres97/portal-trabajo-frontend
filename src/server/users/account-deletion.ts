import "server-only";

import { logger } from "@/lib/logger";
import { revokeEncryptedTokens } from "@/server/auth/session";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import type { ContractStatus } from "@/server/domain/contracts/state-machine";
import { throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";
import { WORKER_BUCKET } from "@/server/storage/files";

/**
 * Eliminación de cuenta por el titular (ADR-018): inmediata e irreversible. La base anonimiza
 * la cuenta y la ficha de trabajador en una transacción (`fn_delete_account`); aquí se limpia lo
 * que vive fuera de ella: refresh tokens de las sesiones web (Cognito) y archivos del trabajador.
 * La cuenta ciudadana de Cognito no se borra: es del GAD y la usan otros servicios.
 */

export type BlockingContract = {
  id: string;
  status: ContractStatus;
  role: "CLIENTE" | "TRABAJADOR";
  counterpartName: string;
};

export type AccountDeletionCheck = {
  /** Se puede eliminar ya (no hay contrataciones en marcha). */
  canDelete: boolean;
  isWorker: boolean;
  /** Contrataciones en marcha que hay que terminar o cancelar antes. */
  blockingContracts: BlockingContract[];
  /** Propuestas sin aceptar que se cancelarán al eliminar. */
  pendingProposals: number;
};

export type AccountDeletionResult = { cancelledProposals: number; closedConversations: number };

export async function getAccountDeletionCheck(user: AppUser): Promise<AccountDeletionCheck> {
  const { data, error } = await getAdminDb().rpc("fn_account_deletion_check", { p_user_id: user.id });
  if (error) throwPg(error);
  const r = data as Omit<AccountDeletionCheck, "canDelete">;
  return { canDelete: r.blockingContracts.length === 0, ...r };
}

export async function deleteAccount(user: AppUser, ctx: RequestContext): Promise<AccountDeletionResult> {
  const { data, error } = await getAdminDb().rpc("fn_delete_account", { p_user_id: user.id, ...auditParams(ctx) });
  if (error) throwPg(error);
  const r = data as AccountDeletionResult & { tokens: string[]; files: string[] };

  // La cuenta ya quedó eliminada: lo que falle aquí se registra y no se reintenta.
  await revokeEncryptedTokens(r.tokens).catch((e) =>
    logger.warn("account.delete.token_revoke_failed", { userId: user.id, error: e }),
  );
  if (r.files.length > 0) {
    const { error: errorArchivos } = await getAdminDb().storage.from(WORKER_BUCKET).remove(r.files);
    if (errorArchivos) {
      logger.warn("account.delete.files_cleanup_failed", {
        userId: user.id,
        count: r.files.length,
        error: errorArchivos,
      });
    }
  }
  logger.info("account.deleted", { userId: user.id, cancelledProposals: r.cancelledProposals });
  return { cancelledProposals: r.cancelledProposals, closedConversations: r.closedConversations };
}
