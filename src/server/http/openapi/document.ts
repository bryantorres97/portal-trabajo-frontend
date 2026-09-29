import { z } from "zod";

import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import {
  bajaDispositivoSchema,
  preferenciasSchema,
  dispositivoAnonimoSchema,
} from "@/server/domain/notifications/schemas";
import {
  deviceSchema,
  markNotificationsSchema,
  markReadSchema,
  reportMessageSchema,
  sendMessageSchema,
  startConversationSchema,
} from "@/server/domain/chat/schemas";
import {
  acceptSchema,
  cancelSchema,
  counterSchema,
  declineSchema,
  disputeSchema,
  proposeSchema,
} from "@/server/domain/contracts/schemas";
import { createReportSchema, evidenceNoteSchema } from "@/server/domain/reports/schemas";
import { TIPOS_OBJETIVO } from "@/server/domain/reports/state-machine";
import { reportReviewSchema, reviewSchema } from "@/server/domain/reviews/schemas";
import { clientProfileSchema, mobileBootstrapSchema } from "@/server/domain/users/schemas";
import { availabilitySchema, profileProposalSchema } from "@/server/domain/workers/schemas";
import * as r from "@/server/http/openapi/responses";

/**
 * Documento OpenAPI 3.1 de `/api/v1` (Fase 11, app móvil). Los cuerpos de entrada salen de los
 * mismos esquemas Zod que valida el servidor; las respuestas, de `responses.ts`, que el typecheck
 * mantiene alineadas con los tipos del servidor. Un test exige que cada Route Handler esté aquí.
 */

type Acceso = "PUBLICO" | "U" | "C" | "CHAT";
type Parametro = { name: string; in: "query" | "path"; description?: string; schema: Record<string, unknown> };
type Respuesta = { status: number; description: string; schema?: Record<string, unknown>; contentType?: string };

type Operacion = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: Acceso;
  /** Solo acepta `Authorization: Bearer` (no la cookie web). */
  bearerOnly?: boolean;
  params?: Parametro[];
  /** Cuerpo JSON validado por un esquema Zod del servidor. */
  body?: z.ZodType;
  /** Cuerpo multipart con un archivo en `file`. */
  multipartFile?: string;
  ok: Respuesta;
  errors?: number[];
};

// --- Utilidades -----------------------------------------------------------------------------

function limpiar(schema: Record<string, unknown>) {
  const { $schema: _omitido, ...resto } = schema;
  return resto;
}

/**
 * Cuerpo de entrada: tipos y límites del lado de salida (lo que el servidor valida tras normalizar)
 * y campos obligatorios del lado de entrada (los que tienen valor por defecto son opcionales).
 */
export function entrada(schema: z.ZodType): Record<string, unknown> {
  const salida = limpiar(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<string, unknown>);
  const entrada = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as { required?: string[] };
  if (salida.type === "object") {
    if (entrada.required?.length) salida.required = entrada.required;
    else delete salida.required;
  }
  return salida;
}

function salida(schema: z.ZodType): Record<string, unknown> {
  return limpiar(z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>);
}

const ref = (nombre: string) => ({ $ref: `#/components/schemas/${nombre}` });
const lista = (nombre: string) => ({
  type: "object",
  properties: { items: { type: "array", items: ref(nombre) } },
  required: ["items"],
});
const objeto = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
});
const uuid = { type: "string", format: "uuid" };
const idPath = (descripcion = "Identificador"): Parametro => ({
  name: "id",
  in: "path",
  description: descripcion,
  schema: uuid,
});
const estado = objeto({ status: { type: "string", description: "Nuevo estado de la contratación" } });
const sinContenido: Respuesta = { status: 204, description: "Hecho" };

// --- Componentes ----------------------------------------------------------------------------

const componentes: Record<string, z.ZodType> = {
  Problem: r.problemSchema,
  Category: r.publicCategorySchema,
  Parish: r.parishSchema,
  WorkerCard: r.workerCardSchema,
  WorkerDetail: r.publicWorkerSchema,
  SearchResult: r.searchResultSchema,
  PublicReview: r.publicReviewSchema,
  Me: r.meSchema,
  OwnWorker: r.ownWorkerSchema,
  AccountDeletionCheck: r.accountDeletionCheckSchema,
  ConversationSummary: r.conversationSummarySchema,
  ChatMessage: r.chatMessageSchema,
  ClientReputation: r.clientReputationSchema,
  ContractSummary: r.contractSummarySchema,
  ContractDetail: r.contractDetailSchema,
  ContractReviews: r.contractReviewsSchema,
  MyReportSummary: r.myReportSummarySchema,
  MyReport: r.myReportSchema,
  Notification: r.notificationSchema,
};

// --- Operaciones ----------------------------------------------------------------------------

const DESCRIPCION_ACCESO: Record<Acceso, string> = {
  PUBLICO: "Público, sin autenticación.",
  U: "Requiere sesión activa (401 sin sesión; 403 si la cuenta no está ACTIVA).",
  C: "Requiere sesión activa y consentimiento vigente (403 hasta `POST /me/consents`).",
  CHAT: "Requiere sesión, consentimiento vigente y rol CLIENTE o TRABAJADOR.",
};

const ERRORES_POR_ACCESO: Record<Acceso, number[]> = { PUBLICO: [], U: [401, 403], C: [401, 403], CHAT: [401, 403] };

const DESCRIPCION_ERROR: Record<number, string> = {
  400: "Solicitud mal formada (Content-Type o JSON)",
  401: "Sin sesión o token inválido, vencido o anterior a un cierre global",
  403: "Sin permiso, cuenta bloqueada o consentimiento pendiente",
  404: "No existe o no participas",
  409: "Conflicto (versión obsoleta, duplicado o estado que no lo permite)",
  422: "Datos inválidos (`errors` por campo)",
  429: "Límite de uso alcanzado",
  503: "Servicio no configurado",
};

const buscarTrabajadores: Parametro[] = [
  { name: "q", in: "query", description: "Texto libre (máx. 100)", schema: { type: "string", maxLength: 100 } },
  { name: "categoria", in: "query", description: "Slug de categoría", schema: { type: "string" } },
  { name: "oficio", in: "query", description: "Slug de oficio", schema: { type: "string" } },
  { name: "parroquia", in: "query", description: "Código de parroquia", schema: { type: "string" } },
  { name: "disponible", in: "query", description: "`1`: solo disponibles", schema: { type: "string", enum: ["1"] } },
  {
    name: "experiencia",
    in: "query",
    description: "Años mínimos",
    schema: { type: "integer", minimum: 1, maximum: 40 },
  },
  {
    name: "calificacion",
    in: "query",
    description: "Calificación mínima",
    schema: { type: "integer", minimum: 1, maximum: 5 },
  },
  {
    name: "orden",
    in: "query",
    schema: { type: "string", enum: ["relevancia", "calificacion", "experiencia", "nombre"] },
  },
  { name: "pagina", in: "query", description: "12 por página", schema: { type: "integer", minimum: 1, maximum: 500 } },
];

export const OPERACIONES: Operacion[] = [
  // Catálogo y contenido
  {
    method: "get",
    path: "/categories",
    tag: "Catálogo",
    summary: "Categorías con sus oficios activos",
    access: "PUBLICO",
    ok: {
      status: 200,
      description: "Catálogo",
      schema: objeto({ categories: { type: "array", items: ref("Category") } }),
    },
  },
  {
    method: "get",
    path: "/parishes",
    tag: "Catálogo",
    summary: "Parroquias del cantón",
    access: "PUBLICO",
    ok: {
      status: 200,
      description: "Parroquias",
      schema: objeto({ parishes: { type: "array", items: ref("Parish") } }),
    },
  },
  {
    method: "get",
    path: "/content/faq",
    tag: "Contenido",
    summary: "Preguntas frecuentes publicadas",
    access: "PUBLICO",
    ok: {
      status: 200,
      description: "Preguntas y respuestas (markdown)",
      schema: objeto({
        items: {
          type: "array",
          items: objeto({
            id: uuid,
            audience: { type: "string", enum: ["GENERAL", "CLIENTES", "TRABAJADORES"] },
            question: { type: "string" },
            answerMd: { type: "string" },
          }),
        },
      }),
    },
  },
  {
    method: "get",
    path: "/content/legal/{code}",
    tag: "Contenido",
    summary: "Versión vigente de un documento legal",
    access: "PUBLICO",
    params: [{ name: "code", in: "path", schema: { type: "string", enum: ["TERMINOS", "PRIVACIDAD"] } }],
    ok: {
      status: 200,
      description: "Documento (markdown)",
      schema: objeto({
        code: { type: "string" },
        version: { type: "integer" },
        title: { type: "string" },
        content: { type: "string" },
        publishedAt: { type: "string", format: "date-time" },
      }),
    },
    errors: [404],
  },
  {
    method: "get",
    path: "/report-reasons",
    tag: "Denuncias",
    summary: "Motivos de denuncia activos",
    access: "PUBLICO",
    params: [
      {
        name: "targetType",
        in: "query",
        description: "Sin filtro: todos",
        schema: { type: "string", enum: [...TIPOS_OBJETIVO] },
      },
    ],
    ok: {
      status: 200,
      description: "Motivos en el orden del panel",
      schema: objeto({
        items: {
          type: "array",
          items: objeto({
            targetType: { type: "string", enum: [...TIPOS_OBJETIVO] },
            code: { type: "string" },
            label: { type: "string" },
          }),
        },
      }),
    },
    errors: [422],
  },
  // Trabajadores públicos
  {
    method: "get",
    path: "/workers",
    tag: "Trabajadores",
    summary: "Buscar trabajadores habilitados",
    description: "Los valores inválidos se ignoran.",
    access: "PUBLICO",
    params: buscarTrabajadores,
    ok: { status: 200, description: "Página de resultados", schema: ref("SearchResult") },
  },
  {
    method: "get",
    path: "/workers/{id}",
    tag: "Trabajadores",
    summary: "Perfil público de un trabajador habilitado",
    access: "PUBLICO",
    params: [idPath()],
    ok: { status: 200, description: "Perfil", schema: ref("WorkerDetail") },
    errors: [404],
  },
  {
    method: "get",
    path: "/workers/{id}/photo",
    tag: "Trabajadores",
    summary: "Foto aprobada del trabajador",
    access: "PUBLICO",
    params: [idPath()],
    ok: { status: 200, description: "Imagen", contentType: "image/*", schema: { type: "string", format: "binary" } },
    errors: [404],
  },
  {
    method: "get",
    path: "/workers/{id}/reviews",
    tag: "Trabajadores",
    summary: "Reseñas públicas del trabajador (10 por página)",
    access: "PUBLICO",
    params: [idPath(), { name: "page", in: "query", schema: { type: "integer", minimum: 1 } }],
    ok: {
      status: 200,
      description: "Página de reseñas",
      schema: objeto({
        items: { type: "array", items: ref("PublicReview") },
        total: { type: "integer" },
        hasMore: { type: "boolean" },
      }),
    },
  },
  // Cuenta
  {
    method: "post",
    path: "/me/bootstrap",
    tag: "Cuenta",
    summary: "Primer ingreso desde la app móvil",
    description:
      "Con `Authorization: Bearer <access token>` y el ID token del mismo inicio de sesión (emitido para un client ID de la app). Crea la cuenta (rol CLIENTE) o la encuentra, y audita el ingreso. Idempotente: 201 si se creó, 200 si ya existía.",
    access: "PUBLICO",
    bearerOnly: true,
    body: mobileBootstrapSchema,
    ok: {
      status: 200,
      description: "Cuenta (igual que GET /me) y `created`",
      schema: { allOf: [ref("Me"), objeto({ created: { type: "boolean" } })] },
    },
    errors: [401, 403, 422, 503],
  },
  {
    method: "get",
    path: "/me",
    tag: "Cuenta",
    summary: "Mi cuenta",
    access: "U",
    ok: { status: 200, description: "Cuenta", schema: ref("Me") },
  },
  {
    method: "patch",
    path: "/me",
    tag: "Cuenta",
    summary: "Actualizar mi perfil de cliente",
    access: "C",
    body: clientProfileSchema,
    ok: { status: 200, description: "Perfil guardado", schema: objeto({ profile: salida(r.meSchema.shape.profile) }) },
    errors: [422],
  },
  {
    method: "delete",
    path: "/me",
    tag: "Cuenta",
    summary: "Eliminar mi cuenta",
    description:
      "Inmediata e irreversible (ADR-018). Cancela las propuestas sin aceptar, cierra las conversaciones, anonimiza la cuenta y, si es trabajador, retira y anonimiza su ficha. Mensajes y reseñas se conservan con el autor «Cuenta eliminada». La cuenta ciudadana de Cognito no se borra. 409 si hay contrataciones en marcha (ver GET /me/deletion). Después, la app debe cerrar la sesión local: los tokens dejan de valer.",
    access: "U",
    ok: { status: 200, description: "Cuenta eliminada", schema: salida(r.accountDeletionResultSchema) },
    errors: [409],
  },
  {
    method: "get",
    path: "/me/deletion",
    tag: "Cuenta",
    summary: "Qué pasaría al eliminar mi cuenta",
    description: "Contrataciones en marcha que lo impiden y propuestas que se cancelarían.",
    access: "U",
    ok: { status: 200, description: "Verificación", schema: ref("AccountDeletionCheck") },
  },
  {
    method: "get",
    path: "/me/consents",
    tag: "Cuenta",
    summary: "Documentos legales vigentes y si los acepté",
    access: "U",
    ok: {
      status: 200,
      description: "Documentos",
      schema: objeto({
        documents: {
          type: "array",
          items: objeto({
            code: { type: "string" },
            version: { type: "integer" },
            title: { type: "string" },
            content: { type: "string" },
            accepted: { type: "boolean" },
          }),
        },
      }),
    },
  },
  {
    method: "post",
    path: "/me/consents",
    tag: "Cuenta",
    summary: "Aceptar todas las versiones vigentes pendientes",
    access: "U",
    ok: { status: 200, description: "Aceptados", schema: objeto({ accepted: { type: "integer" } }) },
  },
  {
    method: "get",
    path: "/me/preferences",
    tag: "Cuenta",
    summary: "Mis preferencias",
    access: "U",
    ok: { status: 200, description: "Preferencias", schema: entrada(preferenciasSchema) },
  },
  {
    method: "put",
    path: "/me/preferences",
    tag: "Cuenta",
    summary: "Cambiar mis preferencias (avisos del GAD por push)",
    access: "U",
    body: preferenciasSchema,
    ok: { status: 200, description: "Preferencias", schema: entrada(preferenciasSchema) },
    errors: [422],
  },
  {
    method: "get",
    path: "/me/sessions",
    tag: "Cuenta",
    summary: "Mis sesiones web activas",
    access: "U",
    ok: {
      status: 200,
      description: "Sesiones",
      schema: objeto({ sessions: { type: "array", items: { type: "object" } } }),
    },
  },
  {
    method: "delete",
    path: "/me/sessions",
    tag: "Cuenta",
    summary: "Cerrar sesión en todos los dispositivos",
    description:
      "Cierra las sesiones web, revoca sus refresh tokens y rechaza (401) los access tokens de la app autenticados antes de este momento.",
    access: "U",
    ok: { status: 200, description: "Sesiones web cerradas", schema: objeto({ revoked: { type: "integer" } }) },
  },
  {
    method: "get",
    path: "/me/unread",
    tag: "Cuenta",
    summary: "Resumen de mensajes sin leer",
    description: "Sin sesión responde 200 con `signedIn: false`.",
    access: "PUBLICO",
    ok: {
      status: 200,
      description: "Resumen",
      schema: objeto(
        {
          signedIn: { type: "boolean" },
          chat: { type: "boolean" },
          userId: uuid,
          unreadMessages: { type: "integer" },
          unreadConversations: { type: "integer" },
        },
        ["signedIn", "chat", "unreadMessages", "unreadConversations"],
      ),
    },
  },
  // Espacio del trabajador
  {
    method: "get",
    path: "/me/worker",
    tag: "Trabajador",
    summary: "Mi ficha de trabajador",
    access: "U",
    ok: { status: 200, description: "Ficha", schema: ref("OwnWorker") },
    errors: [404],
  },
  {
    method: "patch",
    path: "/me/worker",
    tag: "Trabajador",
    summary: "Cambiar mi disponibilidad",
    access: "C",
    body: availabilitySchema,
    ok: { status: 200, description: "Ficha", schema: ref("OwnWorker") },
    errors: [422],
  },
  {
    method: "post",
    path: "/me/worker/link",
    tag: "Trabajador",
    summary: "Vincular mi cuenta con el código de activación",
    description: "201 al vincular, 200 si ya era trabajador. 429 tras 5 intentos fallidos en 15 minutos.",
    access: "C",
    body: z.object({ code: z.string().max(20).describe("8 caracteres, con o sin guion (ABCD-2345)") }),
    ok: {
      status: 201,
      description: "Vinculada",
      schema: objeto({ result: { type: "string", enum: ["LINKED", "ALREADY_WORKER"] }, workerId: uuid }),
    },
    errors: [422, 429],
  },
  {
    method: "post",
    path: "/me/worker/photo",
    tag: "Trabajador",
    summary: "Proponer una foto para mi perfil público",
    description: "Queda pendiente hasta que el GAD la apruebe.",
    access: "C",
    multipartFile: "JPG, PNG o WEBP; hasta 4 MB",
    ok: { status: 201, description: "Ficha", schema: ref("OwnWorker") },
    errors: [400, 422],
  },
  {
    method: "post",
    path: "/me/worker/proposal",
    tag: "Trabajador",
    summary: "Proponer mi descripción y nota de horario",
    description: "Se publican cuando el GAD las aprueba.",
    access: "C",
    body: profileProposalSchema,
    ok: { status: 201, description: "Ficha", schema: ref("OwnWorker") },
    errors: [422],
  },
  // Chat
  {
    method: "get",
    path: "/conversations",
    tag: "Chat",
    summary: "Mis conversaciones",
    access: "CHAT",
    ok: { status: 200, description: "Bandeja", schema: lista("ConversationSummary") },
  },
  {
    method: "post",
    path: "/conversations",
    tag: "Chat",
    summary: "Iniciar (o retomar) una conversación con un trabajador",
    description: "Solo clientes. 201 si se creó, 200 si ya existía. Máximo 10 nuevas por día.",
    access: "CHAT",
    body: startConversationSchema,
    ok: {
      status: 201,
      description: "Conversación",
      schema: objeto({ conversationId: uuid, messageId: { type: "integer" }, created: { type: "boolean" } }),
    },
    errors: [422, 429],
  },
  {
    method: "get",
    path: "/conversations/{id}",
    tag: "Chat",
    summary: "Una conversación",
    access: "CHAT",
    params: [idPath()],
    ok: { status: 200, description: "Conversación", schema: ref("ConversationSummary") },
    errors: [404],
  },
  {
    method: "get",
    path: "/conversations/{id}/messages",
    tag: "Chat",
    summary: "Mensajes (orden cronológico, paginación hacia atrás)",
    access: "CHAT",
    params: [
      idPath(),
      { name: "before", in: "query", description: "Mensajes anteriores a este id", schema: { type: "integer" } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
    ],
    ok: {
      status: 200,
      description: "Mensajes",
      schema: objeto({ items: { type: "array", items: ref("ChatMessage") }, hasMore: { type: "boolean" } }),
    },
    errors: [404],
  },
  {
    method: "post",
    path: "/conversations/{id}/messages",
    tag: "Chat",
    summary: "Enviar un mensaje",
    description: "Idempotente con `clientMessageId`. Máximo 20 por minuto.",
    access: "CHAT",
    params: [idPath()],
    body: sendMessageSchema,
    ok: { status: 201, description: "Enviado", schema: objeto({ id: { type: "integer" } }) },
    errors: [404, 422, 429],
  },
  {
    method: "post",
    path: "/conversations/{id}/read",
    tag: "Chat",
    summary: "Marcar como leído",
    access: "CHAT",
    params: [idPath()],
    body: markReadSchema,
    ok: { status: 200, description: "Leído", schema: objeto({ lastReadId: { type: ["integer", "null"] } }) },
    errors: [404],
  },
  {
    method: "post",
    path: "/conversations/{id}/block",
    tag: "Chat",
    summary: "Bloquear la conversación",
    access: "CHAT",
    params: [idPath()],
    ok: sinContenido,
    errors: [404],
  },
  {
    method: "delete",
    path: "/conversations/{id}/block",
    tag: "Chat",
    summary: "Desbloquear la conversación",
    access: "CHAT",
    params: [idPath()],
    ok: sinContenido,
    errors: [404],
  },
  {
    method: "get",
    path: "/conversations/{id}/client-reputation",
    tag: "Chat",
    summary: "Reputación del cliente (solo para el trabajador de la conversación, RN-20)",
    access: "CHAT",
    params: [idPath()],
    ok: { status: 200, description: "Reputación", schema: ref("ClientReputation") },
    errors: [404],
  },
  {
    method: "post",
    path: "/messages/{id}/report",
    tag: "Denuncias",
    summary: "Denunciar un mensaje",
    access: "CHAT",
    params: [{ name: "id", in: "path", schema: { type: "integer" } }],
    body: reportMessageSchema,
    ok: { status: 201, description: "Denuncia creada", schema: objeto({ id: uuid }) },
    errors: [404, 409, 422, 429],
  },
  // Contrataciones
  {
    method: "get",
    path: "/contracts",
    tag: "Contrataciones",
    summary: "Mis contrataciones",
    access: "CHAT",
    params: [
      {
        name: "scope",
        in: "query",
        schema: { type: "string", enum: ["activas", "historial", "todas"], default: "activas" },
      },
      { name: "conversationId", in: "query", schema: uuid },
    ],
    ok: { status: 200, description: "Contrataciones", schema: lista("ContractSummary") },
  },
  {
    method: "post",
    path: "/contracts",
    tag: "Contrataciones",
    summary: "Proponer condiciones desde una conversación",
    description: "Enviar la propuesta cuenta como aceptación de quien la envía (ADR-014). Máximo 10 por día.",
    access: "CHAT",
    body: proposeSchema,
    ok: { status: 201, description: "Contratación creada", schema: objeto({ id: uuid }) },
    errors: [404, 409, 422, 429],
  },
  {
    method: "get",
    path: "/contracts/{id}",
    tag: "Contrataciones",
    summary: "Detalle con versiones, eventos y acciones disponibles",
    access: "CHAT",
    params: [idPath()],
    ok: { status: 200, description: "Detalle", schema: ref("ContractDetail") },
    errors: [404],
  },
  ...accionesContrato(),
  // Denuncias
  {
    method: "get",
    path: "/reports",
    tag: "Denuncias",
    summary: "Mis denuncias",
    access: "CHAT",
    ok: { status: 200, description: "Denuncias", schema: lista("MyReportSummary") },
  },
  {
    method: "post",
    path: "/reports",
    tag: "Denuncias",
    summary: "Denunciar un perfil, un cliente o una conversación",
    description: "Mensajes, reseñas y contrataciones se denuncian desde sus rutas. Máximo 10 por día.",
    access: "CHAT",
    body: createReportSchema,
    ok: { status: 201, description: "Denuncia creada", schema: objeto({ id: uuid }) },
    errors: [404, 409, 422, 429],
  },
  {
    method: "get",
    path: "/reports/{id}",
    tag: "Denuncias",
    summary: "Seguimiento de una denuncia propia",
    access: "CHAT",
    params: [idPath()],
    ok: { status: 200, description: "Denuncia", schema: ref("MyReport") },
    errors: [404],
  },
  {
    method: "post",
    path: "/reports/{id}/evidence",
    tag: "Denuncias",
    summary: "Aportar una nota (JSON) o un archivo (multipart `file`)",
    description: "Archivos PDF, JPG, PNG o WEBP de hasta 4 MB; hasta 5 archivos y 20 notas por denuncia.",
    access: "CHAT",
    params: [idPath()],
    body: evidenceNoteSchema,
    multipartFile: "PDF, JPG, PNG o WEBP; hasta 4 MB",
    ok: { status: 201, description: "Evidencia agregada", schema: objeto({ id: uuid }) },
    errors: [404, 409, 422, 429],
  },
  {
    method: "post",
    path: "/reviews/{id}/report",
    tag: "Denuncias",
    summary: "Denunciar una reseña",
    access: "CHAT",
    params: [idPath()],
    body: reportReviewSchema,
    ok: { status: 201, description: "Denuncia creada", schema: objeto({ id: uuid }) },
    errors: [404, 409, 422, 429],
  },
  // Notificaciones, dispositivos y tiempo real
  {
    method: "get",
    path: "/notifications",
    tag: "Notificaciones",
    summary: "Últimas 20 notificaciones in-app y cantidad sin leer",
    access: "U",
    ok: {
      status: 200,
      description: "Notificaciones",
      schema: objeto({ unread: { type: "integer" }, items: { type: "array", items: ref("Notification") } }),
    },
  },
  {
    method: "post",
    path: "/notifications",
    tag: "Notificaciones",
    summary: "Marcar como leídas (todas si no se envían ids)",
    access: "U",
    body: markNotificationsSchema,
    ok: { status: 200, description: "Actualizadas", schema: objeto({ updated: { type: "integer" } }) },
    errors: [422],
  },
  {
    method: "post",
    path: "/devices",
    tag: "Notificaciones",
    summary: "Registrar el token FCM del dispositivo para mi cuenta",
    access: "CHAT",
    body: deviceSchema,
    ok: sinContenido,
    errors: [422],
  },
  {
    method: "delete",
    path: "/devices",
    tag: "Notificaciones",
    summary: "Dar de baja el token (al cerrar sesión: `keepAnonymous: true`)",
    access: "CHAT",
    body: bajaDispositivoSchema,
    ok: sinContenido,
    errors: [422],
  },
  {
    method: "post",
    path: "/devices/anonymous",
    tag: "Notificaciones",
    summary: "Registrar un dispositivo de la app sin sesión (avisos del GAD)",
    description: "FCM valida el token. Máximo 30 tokens nuevos por IP y hora.",
    access: "PUBLICO",
    body: dispositivoAnonimoSchema,
    ok: sinContenido,
    errors: [422, 429],
  },
  {
    method: "post",
    path: "/realtime/token",
    tag: "Tiempo real",
    summary: "Token de 10 minutos para Supabase Realtime",
    description: "Canales privados en modo Broadcast: `user:{userId}` y `conversation:{id}` donde participo (ADR-004).",
    access: "CHAT",
    ok: {
      status: 200,
      description: "Token",
      schema: objeto({ token: { type: "string" }, expiresAt: { type: "string", format: "date-time" }, userId: uuid }),
    },
    errors: [503],
  },
  {
    method: "get",
    path: "/openapi.json",
    tag: "Documentación",
    summary: "Este documento",
    access: "PUBLICO",
    ok: { status: 200, description: "OpenAPI 3.1", schema: { type: "object" } },
  },
];

function accionesContrato(): Operacion[] {
  const base = { tag: "Contrataciones", access: "CHAT" as const, params: [idPath("Contratación")] };
  const post = (
    accion: string,
    summary: string,
    body: z.ZodType | undefined,
    ok: Respuesta = { status: 200, description: "Estado", schema: estado },
    errors: number[] = [404, 409, 422],
  ): Operacion => ({ ...base, method: "post", path: `/contracts/{id}/${accion}`, summary, body, ok, errors });
  return [
    post(
      "terms",
      "Contrapropuesta o modificación (409 si `baseVersion` es obsoleta)",
      counterSchema,
      {
        status: 201,
        description: "Versión creada",
        schema: objeto({ version: { type: "integer" } }),
      },
      [404, 409, 422, 429],
    ),
    post("accept", "Aceptar la versión vigente (`version` + `contentHash`)", acceptSchema),
    post("reject", "Rechazar la versión vigente", declineSchema),
    post("withdraw", "Retirar la versión que envié", declineSchema),
    post("cancel", "Cancelar antes de iniciar", cancelSchema),
    post("start", "Iniciar el trabajo (trabajador)", undefined),
    post("complete", "Marcar como terminado (trabajador)", undefined),
    post("confirm", "Confirmar la finalización (cliente)", undefined),
    post(
      "dispute",
      "Abrir una disputa (crea una denuncia CONTRACT)",
      disputeSchema,
      {
        status: 201,
        description: "Disputa abierta",
        schema: objeto({ reportId: uuid }),
      },
      [404, 409, 422, 429],
    ),
    {
      ...base,
      method: "delete",
      path: "/contracts/{id}/dispute",
      summary: "Retirar la disputa que abrí",
      ok: { status: 200, description: "Estado", schema: estado },
      errors: [404, 409],
    },
    {
      ...base,
      method: "get",
      path: "/contracts/{id}/review",
      summary: "Mi calificación y la recibida (si puedo verla, RN-20)",
      ok: { status: 200, description: "Calificaciones", schema: ref("ContractReviews") },
      errors: [404],
    },
    post("review", "Calificar a la otra parte o editar dentro de 7 días (≤ 200 palabras)", reviewSchema, {
      status: 200,
      description: "Calificación guardada",
      schema: objeto({ id: uuid }),
    }),
  ];
}

// --- Documento ------------------------------------------------------------------------------

function operacion(op: Operacion) {
  const respuestas: Record<string, unknown> = {
    [op.ok.status]: {
      description: op.ok.description,
      ...(op.ok.schema ? { content: { [op.ok.contentType ?? "application/json"]: { schema: op.ok.schema } } } : {}),
    },
  };
  const errores = new Set([...ERRORES_POR_ACCESO[op.access], ...(op.errors ?? []), 500]);
  for (const status of [...errores].sort()) {
    respuestas[status] = {
      description: DESCRIPCION_ERROR[status] ?? "Error interno",
      content: { "application/problem+json": { schema: ref("Problem") } },
    };
  }

  const contenido: Record<string, unknown> = {};
  if (op.body) contenido["application/json"] = { schema: entrada(op.body) };
  if (op.multipartFile) {
    contenido["multipart/form-data"] = {
      schema: objeto({ file: { type: "string", format: "binary", description: op.multipartFile } }),
    };
  }

  return {
    tags: [op.tag],
    summary: op.summary,
    description: [op.description, DESCRIPCION_ACCESO[op.access]].filter(Boolean).join("\n\n"),
    ...(op.bearerOnly ? { security: [{ bearerAuth: [] }] } : op.access === "PUBLICO" ? { security: [] } : {}),
    ...(op.params ? { parameters: op.params.map((p) => ({ ...p, required: p.in === "path" })) } : {}),
    ...(Object.keys(contenido).length ? { requestBody: { required: true, content: contenido } } : {}),
    responses: respuestas,
  };
}

export function buildOpenApiDocument(serverUrl = "/api/v1") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERACIONES) (paths[op.path] ??= {})[op.method] = operacion(op);

  return {
    openapi: "3.1.0",
    info: {
      title: "Llankana — API /api/v1",
      version: "1.0.0",
      description: [
        "API del Portal de Empleo del GAD Municipalidad de Ambato para la web y la app móvil.",
        "- Autenticación: `Authorization: Bearer <access token de Cognito>` (app) o la cookie de sesión (web).",
        "- Errores: RFC 9457 (`application/problem+json`).",
        "- Cada respuesta trae `x-request-id`; el cliente puede enviar el suyo.",
        "- Idempotencia: `clientMessageId` en mensajes; concurrencia optimista en contrataciones (409).",
        "- Cambios incompatibles solo en `/api/v2`.",
      ].join("\n"),
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    tags: [...new Set(OPERACIONES.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT (access token de Cognito)" },
        cookieAuth: { type: "apiKey", in: "cookie", name: SESSION_COOKIE },
      },
      schemas: Object.fromEntries(Object.entries(componentes).map(([nombre, s]) => [nombre, salida(s)])),
    },
  };
}
