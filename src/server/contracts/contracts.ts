import "server-only";

import { z } from "zod";

import { requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { listParishes } from "@/server/catalog/catalog";
import { getAdminDb } from "@/server/db/admin";
import {
  acceptSchema,
  cancelSchema,
  counterSchema,
  declineSchema,
  disputeSchema,
  listContractsSchema,
  proposeSchema,
} from "@/server/domain/contracts/schemas";
import {
  availableActions,
  type ContractAction,
  type ContractRole,
  type ContractStatus,
} from "@/server/domain/contracts/state-machine";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";
import { scheduleDispatch } from "@/server/notifications/dispatcher";

/**
 * Contrataciones (Fase 6). Toda operación pasa por funciones SQL `fn_contract_*` que bloquean la
 * contratación, verifican que el usuario sea parte, aplican los plazos vencidos y registran
 * historial, tarjeta en el chat, notificación y auditoría en la misma transacción.
 */

export type ContractSummary = {
  id: string;
  conversationId: string;
  myRole: ContractRole;
  counterpartName: string;
  workerId: string;
  status: ContractStatus;
  needsMyAction: boolean;
  pendingModification: boolean;
  currentVersion: number;
  description: string;
  serviceName: string | null;
  scheduledStart: string;
  priceAmount: number;
  priceUnit: string;
  expiresAt: string | null;
  confirmDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Finalizada y aún sin mi calificación (dentro del plazo). */
  reviewPending: boolean;
};

export type ContractVersion = {
  id: string;
  version: number;
  proposedByMe: boolean;
  proposerRole: ContractRole;
  serviceId: string | null;
  serviceName: string | null;
  description: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  parishCode: string | null;
  parishName: string | null;
  locationDetail: string | null;
  priceAmount: number;
  priceUnit: string;
  conditions: string | null;
  contentHash: string;
  clientAcceptedAt: string | null;
  workerAcceptedAt: string | null;
  rejectedAt: string | null;
  withdrawnAt: string | null;
  responseNote: string | null;
  createdAt: string;
};

export type ContractEvent = {
  id: number;
  event: string;
  byMe: boolean;
  actorRole: ContractRole | "SISTEMA" | "GAD";
  fromStatus: ContractStatus | null;
  toStatus: ContractStatus | null;
  termsVersion: number | null;
  createdAt: string;
};

export type ContractDetail = {
  id: string;
  conversationId: string;
  workerId: string;
  myRole: ContractRole;
  counterpartName: string;
  status: ContractStatus;
  statusBeforeDispute: ContractStatus | null;
  agreedAt: string | null;
  startedAt: string | null;
  completionRequestedAt: string | null;
  completedAt: string | null;
  autoConfirmed: boolean;
  cancelledAt: string | null;
  cancelledByMe: boolean;
  cancelReason: string | null;
  disputedAt: string | null;
  disputedByMe: boolean;
  expiresAt: string | null;
  confirmDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** De la más reciente a la más antigua. */
  versions: ContractVersion[];
  events: ContractEvent[];
  /** Versión vigente (pendiente de respuesta o acordada). */
  current: ContractVersion;
  /** Última versión aceptada por ambas partes (null mientras se negocia). */
  agreed: ContractVersion | null;
  /** Hay una versión pendiente de respuesta (propuesta o modificación). */
  pending: ContractVersion | null;
  actions: ContractAction[];
};

type SummaryRow = {
  id: string;
  conversation_id: string;
  my_role: ContractRole;
  counterpart_name: string;
  worker_id: string;
  status: ContractStatus;
  needs_my_action: boolean;
  pending_modification: boolean;
  current_version: number;
  description: string;
  service_name: string | null;
  scheduled_start: string;
  price_amount: number | string;
  price_unit: string;
  expires_at: string | null;
  confirm_due_at: string | null;
  created_at: string;
  updated_at: string;
  review_pending: boolean;
};

const uuid = (id: string, mensaje = "Contratación no encontrada") => {
  if (!z.uuid().safeParse(id).success) throw new DomainError(404, mensaje);
  return id;
};

function mapSummary(r: SummaryRow): ContractSummary {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    myRole: r.my_role,
    counterpartName: r.counterpart_name,
    workerId: r.worker_id,
    status: r.status,
    needsMyAction: r.needs_my_action,
    pendingModification: r.pending_modification,
    currentVersion: Number(r.current_version),
    description: r.description,
    serviceName: r.service_name,
    scheduledStart: r.scheduled_start,
    priceAmount: Number(r.price_amount),
    priceUnit: r.price_unit,
    expiresAt: r.expires_at,
    confirmDueAt: r.confirm_due_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    reviewPending: r.review_pending,
  };
}

const SCOPES = { activas: "ACTIVAS", historial: "HISTORIAL", todas: null } as const;

export async function listContracts(
  user: AppUser,
  params: unknown = {},
  conversationId?: string,
): Promise<ContractSummary[]> {
  requireUser(user);
  const { scope } = listContractsSchema.parse(params);
  const { data, error } = await getAdminDb().rpc("fn_list_contracts", {
    p_user_id: user.id,
    p_scope: SCOPES[scope],
    p_conversation_id: conversationId ? uuid(conversationId, "Conversación no encontrada") : null,
  });
  if (error) throwPg(error);
  return ((data ?? []) as SummaryRow[]).map(mapSummary);
}

type RawDetail = Omit<ContractDetail, "current" | "agreed" | "pending" | "actions" | "versions"> & {
  currentTermsId: string;
  agreedTermsId: string | null;
  versions: (Omit<ContractVersion, "priceAmount"> & { priceAmount: number | string })[];
};

/** Arma el detalle a partir del JSON de `fn_get_contract` (función pura, probada en unit tests). */
export function buildContractDetail(raw: RawDetail): ContractDetail {
  const { currentTermsId, agreedTermsId, versions: crudas, ...resto } = raw;
  const versions = crudas.map((v) => ({ ...v, priceAmount: Number(v.priceAmount) }));
  const current = versions.find((v) => v.id === currentTermsId);
  if (!current) throw new Error("Contratación sin versión vigente");
  const agreed = versions.find((v) => v.id === agreedTermsId) ?? null;
  const abierta = raw.status === "PROPUESTA_ENVIADA" || raw.status === "CONTRATADA" || raw.status === "EN_CURSO";
  const pending = abierta && current.id !== agreedTermsId ? current : null;
  return {
    ...resto,
    versions,
    current,
    agreed,
    pending,
    actions: availableActions({
      status: raw.status,
      myRole: raw.myRole,
      pendingTerms: pending !== null,
      pendingProposedByMe: pending?.proposedByMe ?? false,
      disputedByMe: raw.disputedByMe,
    }),
  };
}

export async function getContract(user: AppUser, contractId: string): Promise<ContractDetail> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_get_contract", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
  });
  if (error) throwPg(error);
  return buildContractDetail(data as RawDetail);
}

export type FormOptions = {
  services: { id: string; name: string; priceUnit: string; isPrimary: boolean }[];
  parishes: { code: string; name: string }[];
};

/** Servicios que ofrece el trabajador de la conversación y parroquias, para el formulario. */
export async function getContractFormOptions(user: AppUser, conversationId: string): Promise<FormOptions> {
  requireUser(user);
  const [servicios, parroquias] = await Promise.all([
    getAdminDb().rpc("fn_contract_form_options", {
      p_user_id: user.id,
      p_conversation_id: uuid(conversationId, "Conversación no encontrada"),
    }),
    listParishes(),
  ]);
  if (servicios.error) throwPg(servicios.error);
  return {
    services: (
      (servicios.data ?? []) as { service_id: string; service_name: string; price_unit: string; is_primary: boolean }[]
    ).map((s) => ({ id: s.service_id, name: s.service_name, priceUnit: s.price_unit, isPrimary: s.is_primary })),
    parishes: parroquias.map((p) => ({ code: p.code, name: p.name })),
  };
}

export type DisputeReason = { code: string; label: string };

export async function listDisputeReasons(): Promise<DisputeReason[]> {
  const { data, error } = await getAdminDb()
    .from("report_reasons")
    .select("code, label")
    .eq("target_type", "CONTRACT")
    .eq("active", true)
    .order("sort_order")
    .returns<DisputeReason[]>();
  if (error) throw error;
  return data ?? [];
}

/** Primera propuesta desde una conversación. Devuelve el id de la contratación. */
export async function proposeContract(user: AppUser, input: unknown, ctx: RequestContext): Promise<string> {
  requireUser(user);
  const d = proposeSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_contract_propose", {
    p_user_id: user.id,
    p_conversation_id: d.conversationId,
    p_terms: d.terms,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  scheduleDispatch();
  return data as string;
}

/** Contrapropuesta o modificación. Devuelve el número de la nueva versión. */
export async function counterContract(user: AppUser, contractId: string, input: unknown, ctx: RequestContext) {
  requireUser(user);
  const d = counterSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_contract_counter", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
    p_base_version: d.baseVersion,
    p_terms: d.terms,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  scheduleDispatch();
  return Number(data);
}

export async function acceptContract(
  user: AppUser,
  contractId: string,
  input: unknown,
  ctx: RequestContext,
): Promise<ContractStatus> {
  requireUser(user);
  const d = acceptSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_contract_accept", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
    p_version: d.version,
    p_content_hash: d.contentHash.toLowerCase(),
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  scheduleDispatch();
  return data as ContractStatus;
}

/** REJECT (la contraparte rechaza) o WITHDRAW (quien propuso retira) la versión pendiente. */
export async function declineContract(
  user: AppUser,
  contractId: string,
  mode: "REJECT" | "WITHDRAW",
  input: unknown,
  ctx: RequestContext,
): Promise<ContractStatus> {
  requireUser(user);
  const d = declineSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_contract_decline", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
    p_version: d.version,
    p_mode: mode,
    p_note: d.note ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  scheduleDispatch();
  return data as ContractStatus;
}

export async function cancelContract(
  user: AppUser,
  contractId: string,
  input: unknown,
  ctx: RequestContext,
): Promise<ContractStatus> {
  requireUser(user);
  const d = cancelSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_contract_cancel", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
    p_reason: d.reason,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  scheduleDispatch();
  return data as ContractStatus;
}

export type ProgressStep = "START" | "COMPLETE" | "CONFIRM";

export async function progressContract(
  user: AppUser,
  contractId: string,
  step: ProgressStep,
  ctx: RequestContext,
): Promise<ContractStatus> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_contract_progress", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
    p_step: step,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  scheduleDispatch();
  return data as ContractStatus;
}

export async function disputeContract(user: AppUser, contractId: string, input: unknown, ctx: RequestContext) {
  requireUser(user);
  const d = disputeSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_contract_dispute", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
    p_reason_code: d.reasonCode,
    p_description: d.description,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}

export async function withdrawDispute(user: AppUser, contractId: string, ctx: RequestContext): Promise<ContractStatus> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_contract_withdraw_dispute", {
    p_user_id: user.id,
    p_contract_id: uuid(contractId),
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as ContractStatus;
}

/** Tarea programada (respaldo de pg_cron): aplica plazos vencidos en lote. */
export async function runContractMaintenance(): Promise<number> {
  const { data, error } = await getAdminDb().rpc("fn_run_contract_maintenance", {});
  if (error) throwPg(error);
  return Number(data);
}
