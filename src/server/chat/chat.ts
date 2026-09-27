import "server-only";

import { z } from "zod";

import { requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import {
  listMessagesSchema,
  markReadSchema,
  reportMessageSchema,
  sendMessageSchema,
  startConversationSchema,
} from "@/server/domain/chat/schemas";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

/**
 * Chat cliente ↔ trabajador (Fase 5). Toda operación pasa por funciones SQL que verifican que el
 * usuario sea parte de la conversación; el servidor nunca lee mensajes "en nombre del GAD" (RN-09).
 */

export type ConversationSummary = {
  id: string;
  myRole: "CLIENTE" | "TRABAJADOR";
  counterpartName: string;
  workerId: string;
  workerHasPhoto: boolean;
  /** El trabajador ya vinculó su cuenta (si no, leerá los mensajes cuando lo haga). */
  workerLinked: boolean;
  status: "ACTIVA" | "BLOQUEADA" | "CERRADA";
  blockedByMe: boolean;
  blockedByOther: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastSenderIsMe: boolean;
  unread: number;
  /** Último mensaje que leyó la otra parte (para mostrar "Visto"). */
  otherLastReadId: number | null;
  createdAt: string;
};

export type ChatMessage = {
  id: number;
  /** null en mensajes de sistema sin actor (p. ej. una propuesta que expiró). */
  senderId: string | null;
  isMine: boolean;
  kind: "TEXT" | "SYSTEM";
  /** null si el GAD lo ocultó por moderación. */
  body: string | null;
  hidden: boolean;
  /** Contratación a la que se refiere un mensaje de sistema (tarjeta en el chat). */
  contractId: string | null;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  my_role: "CLIENTE" | "TRABAJADOR";
  counterpart_name: string;
  worker_id: string;
  worker_has_photo: boolean;
  worker_linked: boolean;
  status: ConversationSummary["status"];
  blocked_by_me: boolean;
  blocked_by_other: boolean;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_sender_is_me: boolean | null;
  unread: number | string;
  other_last_read_id: number | string | null;
  created_at: string;
};

function mapConversation(r: ConversationRow): ConversationSummary {
  return {
    id: r.id,
    myRole: r.my_role,
    counterpartName: r.counterpart_name,
    workerId: r.worker_id,
    workerHasPhoto: r.worker_has_photo,
    workerLinked: r.worker_linked,
    status: r.status,
    blockedByMe: r.blocked_by_me,
    blockedByOther: r.blocked_by_other,
    lastMessagePreview: r.last_message_preview,
    lastMessageAt: r.last_message_at,
    lastSenderIsMe: !!r.last_sender_is_me,
    unread: Number(r.unread),
    otherLastReadId: r.other_last_read_id == null ? null : Number(r.other_last_read_id),
    createdAt: r.created_at,
  };
}

const uuid = (id: string, mensaje = "Conversación no encontrada") => {
  if (!z.uuid().safeParse(id).success) throw new DomainError(404, mensaje);
  return id;
};

export async function listConversations(user: AppUser): Promise<ConversationSummary[]> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_list_conversations", { p_user_id: user.id });
  if (error) throwPg(error);
  return ((data ?? []) as ConversationRow[]).map(mapConversation);
}

export async function getConversation(user: AppUser, conversationId: string): Promise<ConversationSummary> {
  requireUser(user);
  const { data, error } = await getAdminDb().rpc("fn_list_conversations", {
    p_user_id: user.id,
    p_conversation_id: uuid(conversationId),
  });
  if (error) throwPg(error);
  const fila = ((data ?? []) as ConversationRow[])[0];
  if (!fila) throw new DomainError(404, "Conversación no encontrada");
  return mapConversation(fila);
}

export async function listMessages(
  user: AppUser,
  conversationId: string,
  params: unknown = {},
): Promise<{ items: ChatMessage[]; hasMore: boolean }> {
  requireUser(user);
  const { before, limit } = listMessagesSchema.parse(params);
  const { data, error } = await getAdminDb().rpc("fn_list_messages", {
    p_user_id: user.id,
    p_conversation_id: uuid(conversationId),
    p_before: before ?? null,
    p_limit: limit + 1,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as {
    id: number | string;
    sender_id: string | null;
    is_mine: boolean;
    kind: "TEXT" | "SYSTEM";
    body: string | null;
    hidden: boolean;
    contract_id: string | null;
    created_at: string;
  }[];
  // Llegan del más reciente al más antiguo; se devuelven en orden cronológico.
  const items = filas
    .slice(0, limit)
    .map((m) => ({
      id: Number(m.id),
      senderId: m.sender_id,
      isMine: m.is_mine,
      kind: m.kind,
      body: m.body,
      hidden: m.hidden,
      contractId: m.contract_id,
      createdAt: m.created_at,
    }))
    .reverse();
  return { items, hasMore: filas.length > limit };
}

/** Inicia (o retoma) la conversación con un trabajador habilitado y envía el primer mensaje. */
export async function startConversation(user: AppUser, input: unknown, ctx: RequestContext) {
  requireUser(user);
  const d = startConversationSchema.parse(input);
  const { data, error } = await getAdminDb()
    .rpc("fn_start_conversation", {
      p_user_id: user.id,
      p_worker_id: d.workerId,
      p_body: d.body,
      p_client_message_id: d.clientMessageId ?? null,
      ...auditParams(ctx),
    })
    .single<{ conversation_id: string; message_id: number | string; created: boolean }>();
  if (error) throwPg(error);
  return { conversationId: data.conversation_id, messageId: Number(data.message_id), created: data.created };
}

export async function sendMessage(user: AppUser, conversationId: string, input: unknown): Promise<number> {
  requireUser(user);
  const d = sendMessageSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_send_message", {
    p_user_id: user.id,
    p_conversation_id: uuid(conversationId),
    p_body: d.body,
    p_client_message_id: d.clientMessageId ?? null,
  });
  if (error) throwPg(error);
  return Number(data);
}

export async function markConversationRead(user: AppUser, conversationId: string, input: unknown = {}) {
  requireUser(user);
  const { lastMessageId } = markReadSchema.parse(input);
  const { data, error } = await getAdminDb().rpc("fn_mark_conversation_read", {
    p_user_id: user.id,
    p_conversation_id: uuid(conversationId),
    p_message_id: lastMessageId ?? null,
  });
  if (error) throwPg(error);
  return data == null ? null : Number(data);
}

export async function setConversationBlock(
  user: AppUser,
  conversationId: string,
  blocked: boolean,
  ctx: RequestContext,
) {
  requireUser(user);
  const { error } = await getAdminDb().rpc("fn_set_conversation_block", {
    p_user_id: user.id,
    p_conversation_id: uuid(conversationId),
    p_blocked: blocked,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

export type ReportReason = { code: string; label: string };

export async function listMessageReportReasons(): Promise<ReportReason[]> {
  const { data, error } = await getAdminDb()
    .from("report_reasons")
    .select("code, label")
    .eq("target_type", "MESSAGE")
    .eq("active", true)
    .order("sort_order")
    .returns<ReportReason[]>();
  if (error) throw error;
  return data ?? [];
}

export async function reportMessage(user: AppUser, messageId: number, input: unknown, ctx: RequestContext) {
  requireUser(user);
  const d = reportMessageSchema.parse(input);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) throw new DomainError(404, "Mensaje no encontrado");
  const { data, error } = await getAdminDb().rpc("fn_report_message", {
    p_user_id: user.id,
    p_message_id: messageId,
    p_reason_code: d.reasonCode,
    p_description: d.description ?? null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return data as string;
}
