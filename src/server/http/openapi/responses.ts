import { z } from "zod";

import type { PublicCategory, PublicService, Parish } from "@/server/catalog/catalog";
import type { ChatMessage, ConversationSummary } from "@/server/chat/chat";
import type { ContractDetail, ContractEvent, ContractSummary, ContractVersion } from "@/server/contracts/contracts";
import { CONTRACT_STATUSES, type ContractAction } from "@/server/domain/contracts/state-machine";
import { REPORT_STATUSES, TIPOS_OBJETIVO } from "@/server/domain/reports/state-machine";
import { WORKER_STATUSES } from "@/server/domain/workers/state-machine";
import type { AppNotification } from "@/server/notifications/notifications";
import type { MyReport, MyReportSummary } from "@/server/reports/reports";
import type { ClientReputation, ContractReview, ContractReviews, PublicReview } from "@/server/reviews/reviews";
import type { PublicWorker, SearchResult, WorkerCard } from "@/server/search/workers";
import type { AccountDeletionCheck, AccountDeletionResult } from "@/server/users/account-deletion";
import type { MeResponse } from "@/server/users/me";
import type { OwnWorker } from "@/server/workers/public-profile";

/**
 * Esquemas de las respuestas de `/api/v1` para la OpenAPI (Fase 11, app móvil). Describen los
 * tipos que ya devuelve el servidor; `ComprobacionesDeTipos` hace fallar `pnpm typecheck` si un
 * tipo del servidor cambia y su esquema no, así la documentación no se desincroniza.
 */

const fecha = z.iso.datetime({ offset: true }).describe("ISO 8601");
const dia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD (hora de Ecuador)");
const nulo = <T extends z.ZodType>(s: T) => s.nullable();

export const ACCIONES_CONTRATO = [
  "ACCEPT",
  "REJECT",
  "COUNTER",
  "WITHDRAW",
  "MODIFY",
  "CANCEL",
  "START",
  "COMPLETE",
  "CONFIRM",
  "DISPUTE",
  "WITHDRAW_DISPUTE",
] as const;

const rolContrato = z.enum(["CLIENTE", "TRABAJADOR"]);
const estadoContrato = z.enum(CONTRACT_STATUSES);
const colorMarca = z.enum(["verde", "azul", "magenta", "amarillo", "naranja"]);

export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .describe("Error RFC 9457 (application/problem+json). `errors` solo en 422, con la ruta del campo.");

// --- Catálogo y trabajadores públicos -------------------------------------------------------

export const publicServiceSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: nulo(z.string()),
  priceMin: nulo(z.number()),
  priceMax: nulo(z.number()),
  priceUnit: z.string(),
  imagePath: nulo(z.string()).describe(
    "URL absoluta de la imagen (bucket público del catálogo) o ruta relativa al sitio web (p. ej. /images/oficios/…)",
  ),
  color: colorMarca,
  enabledWorkers: z.number().int(),
  category: z.object({ slug: z.string(), name: z.string() }),
});

export const publicCategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: nulo(z.string()),
  color: colorMarca,
  services: z.array(publicServiceSchema),
});

export const parishSchema = z.object({ code: z.string(), name: z.string(), kind: z.enum(["URBANA", "RURAL"]) });

export const workerCardSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  specialty: nulo(z.string()),
  yearsExperience: z.number().int(),
  isAvailable: z.boolean(),
  parish: nulo(z.string()),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  contractsCompleted: z.number().int(),
  services: z.array(z.object({ slug: z.string(), name: z.string() })),
  hasPhoto: z.boolean().describe("Tiene foto aprobada en /api/v1/workers/{id}/photo"),
});

export const publicWorkerSchema = workerCardSchema.omit({ services: true }).extend({
  bio: nulo(z.string()),
  availabilityNote: nulo(z.string()),
  enabledAt: nulo(fecha),
  services: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      category: z.string(),
      categorySlug: z.string(),
      description: nulo(z.string()),
      yearsExperience: nulo(z.number().int()),
      priceMin: nulo(z.number()),
      priceMax: nulo(z.number()),
      priceUnit: z.string(),
      isPrimary: z.boolean(),
    }),
  ),
});

export const searchResultSchema = z.object({
  items: z.array(workerCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  pages: z.number().int(),
  pageSize: z.number().int(),
});

export const publicReviewSchema = z.object({
  id: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: nulo(z.string()),
  authorName: z.string(),
  serviceName: nulo(z.string()),
  createdAt: fecha,
  edited: z.boolean(),
});

// --- Cuenta ---------------------------------------------------------------------------------

export const accountDeletionCheckSchema = z.object({
  canDelete: z.boolean().describe("No hay contrataciones en marcha"),
  isWorker: z.boolean().describe("Tiene ficha de trabajador vinculada (se retira del catálogo y se anonimiza)"),
  blockingContracts: z
    .array(
      z.object({
        id: z.string(),
        status: estadoContrato,
        role: rolContrato,
        counterpartName: z.string(),
      }),
    )
    .describe("Contrataciones en marcha que hay que terminar o cancelar antes"),
  pendingProposals: z.number().int().describe("Propuestas sin aceptar que se cancelarán"),
});

export const accountDeletionResultSchema = z.object({
  cancelledProposals: z.number().int(),
  closedConversations: z.number().int(),
});

export const meSchema = z.object({
  id: z.string(),
  email: nulo(z.string()),
  displayName: nulo(z.string()),
  status: z.enum(["ACTIVO", "BLOQUEADO", "ELIMINADO"]),
  roles: z.array(z.string()).describe("CLIENTE, TRABAJADOR (tras vincular el código)"),
  permissions: z.array(z.string()),
  profile: nulo(
    z.object({ fullName: z.string(), phone: nulo(z.string()), sector: nulo(z.string()), updatedAt: fecha }),
  ),
  pendingConsents: z
    .array(z.object({ code: z.string(), version: z.number().int(), title: z.string() }))
    .describe("Si no está vacío, las operaciones transaccionales responden 403 hasta POST /me/consents"),
});

export const ownWorkerSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  specialty: nulo(z.string()),
  status: z.enum(WORKER_STATUSES),
  isAvailable: z.boolean(),
  publicBio: nulo(z.string()),
  availabilityNote: nulo(z.string()),
  services: z.array(z.string()),
  parish: nulo(z.string()),
  photo: z.object({
    hasApproved: z.boolean(),
    hasPending: z.boolean(),
    status: z.string(),
    reviewNote: nulo(z.string()),
  }),
  proposal: nulo(z.object({ bio: nulo(z.string()), availabilityNote: nulo(z.string()), submittedAt: fecha })),
  proposalReviewNote: nulo(z.string()),
});

// --- Chat -----------------------------------------------------------------------------------

export const conversationSummarySchema = z.object({
  id: z.string(),
  myRole: rolContrato,
  counterpartName: z.string(),
  workerId: z.string(),
  workerHasPhoto: z.boolean(),
  workerLinked: z.boolean(),
  status: z.enum(["ACTIVA", "BLOQUEADA", "CERRADA"]),
  blockedByMe: z.boolean(),
  blockedByOther: z.boolean(),
  lastMessagePreview: nulo(z.string()),
  lastMessageAt: nulo(fecha),
  lastSenderIsMe: z.boolean(),
  unread: z.number().int(),
  otherLastReadId: nulo(z.number().int()),
  createdAt: fecha,
});

export const chatMessageSchema = z.object({
  id: z.number().int(),
  senderId: nulo(z.string()),
  isMine: z.boolean(),
  kind: z.enum(["TEXT", "SYSTEM"]),
  body: nulo(z.string()).describe("null si el GAD lo ocultó por moderación"),
  hidden: z.boolean(),
  contractId: nulo(z.string()).describe("Mensajes SYSTEM: contratación a la que se refiere"),
  createdAt: fecha,
});

export const clientReputationSchema = z.object({
  average: z.number(),
  count: z.number().int(),
  contractsCompleted: z.number().int(),
  recent: z.array(
    z.object({ rating: z.number().int(), comment: nulo(z.string()), createdAt: fecha, authorName: z.string() }),
  ),
});

// --- Contrataciones -------------------------------------------------------------------------

export const contractSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  myRole: rolContrato,
  counterpartName: z.string(),
  workerId: z.string(),
  status: estadoContrato,
  needsMyAction: z.boolean(),
  pendingModification: z.boolean(),
  currentVersion: z.number().int(),
  description: z.string(),
  serviceName: nulo(z.string()),
  scheduledStart: dia,
  priceAmount: z.number(),
  priceUnit: z.string(),
  expiresAt: nulo(fecha),
  confirmDueAt: nulo(fecha),
  createdAt: fecha,
  updatedAt: fecha,
  reviewPending: z.boolean(),
});

export const contractVersionSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  proposedByMe: z.boolean(),
  proposerRole: rolContrato,
  serviceId: nulo(z.string()),
  serviceName: nulo(z.string()),
  description: z.string(),
  scheduledStart: dia,
  scheduledEnd: nulo(dia),
  parishCode: nulo(z.string()),
  parishName: nulo(z.string()),
  locationDetail: nulo(z.string()),
  priceAmount: z.number(),
  priceUnit: z.string(),
  conditions: nulo(z.string()),
  contentHash: z.string().describe("SHA-256 que se envía en /accept"),
  clientAcceptedAt: nulo(fecha),
  workerAcceptedAt: nulo(fecha),
  rejectedAt: nulo(fecha),
  withdrawnAt: nulo(fecha),
  responseNote: nulo(z.string()),
  createdAt: fecha,
});

export const contractEventSchema = z.object({
  id: z.number().int(),
  event: z.string(),
  byMe: z.boolean(),
  actorRole: z.enum(["CLIENTE", "TRABAJADOR", "SISTEMA", "GAD"]),
  fromStatus: nulo(estadoContrato),
  toStatus: nulo(estadoContrato),
  termsVersion: nulo(z.number().int()),
  createdAt: fecha,
});

export const contractDetailSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  workerId: z.string(),
  myRole: rolContrato,
  counterpartName: z.string(),
  status: estadoContrato,
  statusBeforeDispute: nulo(estadoContrato),
  agreedAt: nulo(fecha),
  startedAt: nulo(fecha),
  completionRequestedAt: nulo(fecha),
  completedAt: nulo(fecha),
  autoConfirmed: z.boolean(),
  cancelledAt: nulo(fecha),
  cancelledByMe: z.boolean(),
  cancelReason: nulo(z.string()),
  disputedAt: nulo(fecha),
  disputedByMe: z.boolean(),
  expiresAt: nulo(fecha),
  confirmDueAt: nulo(fecha),
  createdAt: fecha,
  updatedAt: fecha,
  versions: z.array(contractVersionSchema).describe("De la más reciente a la más antigua"),
  events: z.array(contractEventSchema),
  current: contractVersionSchema,
  agreed: nulo(contractVersionSchema),
  pending: nulo(contractVersionSchema),
  actions: z
    .array(z.enum(ACCIONES_CONTRATO))
    .describe("Acciones disponibles para mí ahora (calculadas por el servidor)"),
});

export const contractReviewSchema = z.object({
  id: z.string(),
  direction: z.enum(["CLIENTE_A_TRABAJADOR", "TRABAJADOR_A_CLIENTE"]),
  rating: z.number().int().min(1).max(5),
  comment: nulo(z.string()),
  status: z.enum(["PUBLICADA", "OCULTA"]),
  isMine: z.boolean(),
  createdAt: fecha,
  editedAt: nulo(fecha),
  editableUntil: fecha,
  canEdit: z.boolean(),
});

export const contractReviewsSchema = z.object({
  canCreate: z.boolean(),
  windowEndsAt: nulo(fecha),
  mine: nulo(contractReviewSchema),
  theirs: nulo(contractReviewSchema).describe("null si no existe o si no puedo verla (RN-20)"),
});

// --- Denuncias y notificaciones -------------------------------------------------------------

export const myReportSummarySchema = z.object({
  id: z.string(),
  targetType: z.enum(TIPOS_OBJETIVO),
  targetLabel: z.string(),
  reasonLabel: z.string(),
  status: z.enum(REPORT_STATUSES),
  publicMessage: z.string(),
  needsInfo: z.boolean(),
  createdAt: fecha,
  updatedAt: fecha,
});

export const myReportSchema = z.object({
  id: z.string(),
  targetType: z.enum(TIPOS_OBJETIVO),
  targetLabel: z.string(),
  reasonLabel: z.string(),
  description: nulo(z.string()),
  status: z.enum(REPORT_STATUSES),
  publicMessage: z.string(),
  open: z.boolean(),
  needsInfo: z.boolean(),
  createdAt: fecha,
  resolvedAt: nulo(fecha),
  events: z.array(
    z.object({
      id: z.number().int(),
      event: z.string(),
      toStatus: nulo(z.enum(REPORT_STATUSES)),
      note: nulo(z.string()),
      byMe: z.boolean(),
      createdAt: fecha,
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["FILE", "NOTE"]),
      name: nulo(z.string()),
      note: nulo(z.string()),
      createdAt: fecha,
    }),
  ),
});

export const notificationSchema = z.object({
  id: z.number().int(),
  type: z
    .string()
    .describe("NEW_MESSAGE, CONTRACT_UPDATE, REVIEW_REQUEST, REPORT_UPDATE, MODERATION_WARNING, AVISO_GAD"),
  title: z.string(),
  body: nulo(z.string()),
  link: nulo(z.string()).describe("Ruta interna del portal (/mensajes/{id}, /contrataciones/{id}, /denuncias/{id}…)"),
  readAt: nulo(fecha),
  createdAt: fecha,
});

// --- Comprobación de tipos ------------------------------------------------------------------

type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Asegurar<T extends true> = T;
type Out<S extends z.ZodType> = z.output<S>;

/** No se usa en ejecución: si algún par deja de coincidir, `tsc` falla. */
export type ComprobacionesDeTipos = [
  Asegurar<Igual<Out<typeof publicServiceSchema>, PublicService>>,
  Asegurar<Igual<Out<typeof publicCategorySchema>, PublicCategory>>,
  Asegurar<Igual<Out<typeof parishSchema>, Parish>>,
  Asegurar<Igual<Out<typeof workerCardSchema>, WorkerCard>>,
  Asegurar<Igual<Out<typeof publicWorkerSchema>, PublicWorker>>,
  Asegurar<Igual<Out<typeof searchResultSchema>, SearchResult>>,
  Asegurar<Igual<Out<typeof publicReviewSchema>, PublicReview>>,
  Asegurar<Igual<Out<typeof meSchema>, MeResponse>>,
  Asegurar<Igual<Out<typeof ownWorkerSchema>, OwnWorker>>,
  Asegurar<Igual<Out<typeof conversationSummarySchema>, ConversationSummary>>,
  Asegurar<Igual<Out<typeof chatMessageSchema>, ChatMessage>>,
  Asegurar<Igual<Out<typeof clientReputationSchema>, ClientReputation>>,
  Asegurar<Igual<Out<typeof contractSummarySchema>, ContractSummary>>,
  Asegurar<Igual<Out<typeof contractVersionSchema>, ContractVersion>>,
  Asegurar<Igual<Out<typeof contractEventSchema>, ContractEvent>>,
  Asegurar<Igual<Out<typeof contractDetailSchema>, ContractDetail>>,
  Asegurar<Igual<Out<typeof contractReviewSchema>, ContractReview>>,
  Asegurar<Igual<Out<typeof contractReviewsSchema>, ContractReviews>>,
  Asegurar<Igual<(typeof ACCIONES_CONTRATO)[number], ContractAction>>,
  Asegurar<Igual<Out<typeof myReportSummarySchema>, MyReportSummary>>,
  Asegurar<Igual<Out<typeof myReportSchema>, MyReport>>,
  Asegurar<Igual<Out<typeof notificationSchema>, AppNotification>>,
  Asegurar<Igual<Out<typeof accountDeletionCheckSchema>, AccountDeletionCheck>>,
  Asegurar<Igual<Out<typeof accountDeletionResultSchema>, AccountDeletionResult>>,
];
