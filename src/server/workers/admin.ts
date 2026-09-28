import "server-only";

import { logAudit } from "@/server/audit/log";
import { hasPermission, requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { parseWorkerForm, statusChangeSchema, toWorkerRpc, workerSearchSchema } from "@/server/domain/workers/schemas";
import { WORKER_STATUSES, transitionPermission, type WorkerStatus } from "@/server/domain/workers/state-machine";
import { DomainError, throwPg } from "@/server/errors";
import { auditParams, type RequestContext } from "@/server/http/request-info";

/**
 * Administración de trabajadores (Fase 4). Cada caso de uso verifica el permiso aquí y, de nuevo,
 * en la función SQL; el cambio y la auditoría se escriben en la misma transacción.
 * Los datos personales (RN-19) solo se devuelven con `worker.read.private` y su consulta se audita.
 */

export const PAGE_SIZE = 20;

export type WorkerListItem = {
  id: string;
  displayName: string;
  legalName: string | null;
  phone: string | null;
  status: WorkerStatus;
  statusChangedAt: string;
  services: string[];
  linked: boolean;
  pendingReview: boolean;
};

type ListRow = {
  id: string;
  public_display_name: string;
  first_names: string;
  last_names: string;
  phone: string | null;
  status: WorkerStatus;
  status_changed_at: string;
  user_id: string | null;
  photo_status: string;
  proposal_submitted_at: string | null;
  worker_services: { is_primary: boolean; services: { name: string } | null }[];
};

/** Escapa comodines de ILIKE y caracteres especiales del filtro `or` de PostgREST. */
function patron(q: string): string {
  return `%${q.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ")}%`;
}

/** Filtro PostgREST: foto o cambios de perfil enviados por el trabajador y aún sin revisar. */
const POR_REVISAR = "photo_status.eq.PENDIENTE,proposal_submitted_at.not.is.null";

export async function searchWorkersAdmin(
  actor: AppUser,
  params: { q?: string; status?: string; pendingReview?: boolean; page?: number },
) {
  requirePermission(actor, "worker.read");
  const { q, status, pendingReview, page } = workerSearchSchema.parse(params);
  const privado = hasPermission(actor, "worker.read.private");
  let query = getAdminDb()
    .from("worker_profiles")
    .select(
      "id, public_display_name, first_names, last_names, phone, status, status_changed_at, user_id, photo_status, proposal_submitted_at, worker_services(is_primary, services(name))",
      { count: "exact" },
    )
    .order("status_changed_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  const grupos: string[] = pendingReview ? [POR_REVISAR] : [];
  if (q) {
    const p = patron(q);
    const telefono = q.replace(/[\s-]/g, "");
    // Buscar por teléfono o correo revela datos personales: solo con worker.read.private.
    const filtros = [`public_display_name.ilike.${p}`];
    if (privado) {
      filtros.push(`first_names.ilike.${p}`, `last_names.ilike.${p}`, `email.ilike.${p}`);
      if (/^\d{4,10}$/.test(telefono)) filtros.push(`phone.like.${telefono}%`);
    }
    grupos.push(filtros.join(","));
  }
  // Dos grupos OR se combinan con AND en un único filtro (PostgREST admite lógica anidada).
  if (grupos.length === 1) query = query.or(grupos[0]);
  if (grupos.length === 2) query = query.or(`and(or(${grupos[0]}),or(${grupos[1]}))`);
  const { data, error, count } = await query.returns<ListRow[]>();
  if (error) throw error;
  const items: WorkerListItem[] = (data ?? []).map((w) => ({
    id: w.id,
    displayName: w.public_display_name,
    legalName: privado ? `${w.first_names} ${w.last_names}` : null,
    phone: privado ? w.phone : null,
    status: w.status,
    statusChangedAt: w.status_changed_at,
    services: [...w.worker_services]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((s) => s.services?.name ?? "")
      .filter(Boolean),
    linked: !!w.user_id,
    pendingReview: w.photo_status === "PENDIENTE" || !!w.proposal_submitted_at,
  }));
  return { items, total: count ?? 0, page, pageSize: PAGE_SIZE };
}

export type ResumenTrabajadores = {
  porEstado: Record<WorkerStatus, number>;
  /** Perfiles con foto o descripción enviadas por el trabajador y pendientes de revisión. */
  porRevisar: number;
  /** Documentos cargados y aún sin validar. */
  documentosPendientes: number;
};

/** Conteos para la portada del panel. Solo cifras: no expone datos de ningún trabajador. */
export async function workerSummary(actor: AppUser): Promise<ResumenTrabajadores> {
  requirePermission(actor, "worker.read");
  const db = getAdminDb();
  const contar = async (consulta: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await consulta;
    if (error) throw error;
    return count ?? 0;
  };
  const perfiles = () => db.from("worker_profiles").select("id", { count: "exact", head: true });
  const [estados, porRevisar, documentosPendientes] = await Promise.all([
    Promise.all(WORKER_STATUSES.map(async (s) => [s, await contar(perfiles().eq("status", s))] as const)),
    contar(perfiles().neq("status", "RECHAZADO").or(POR_REVISAR)),
    contar(db.from("worker_documents").select("id", { count: "exact", head: true }).eq("status", "PENDIENTE")),
  ]);
  return {
    porEstado: Object.fromEntries(estados) as Record<WorkerStatus, number>,
    porRevisar,
    documentosPendientes,
  };
}

export type WorkerDetail = Awaited<ReturnType<typeof getWorkerDetail>>;

type DetailRow = {
  id: string;
  user_id: string | null;
  first_names: string;
  last_names: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birth_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  public_display_name: string;
  specialty: string | null;
  public_bio: string | null;
  years_experience: number;
  is_available: boolean;
  availability_note: string | null;
  status: WorkerStatus;
  status_changed_at: string;
  enabled_at: string | null;
  suspended_until: string | null;
  photo_path: string | null;
  photo_pending_path: string | null;
  photo_status: string;
  photo_review_note: string | null;
  proposed_bio: string | null;
  proposed_availability_note: string | null;
  proposal_submitted_at: string | null;
  proposal_review_note: string | null;
  created_at: string;
  parishes: { code: string; name: string } | null;
  registrador: { display_name: string | null } | null;
  worker_services: { service_id: string; is_primary: boolean; services: { name: string; slug: string } | null }[];
};

/** Ficha administrativa completa. Con `worker.read.private` incluye datos personales y lo audita. */
export async function getWorkerDetail(actor: AppUser, workerId: string, ctx: RequestContext) {
  requirePermission(actor, "worker.read");
  const db = getAdminDb();
  const { data: w, error } = await db
    .from("worker_profiles")
    .select(
      `id, user_id, first_names, last_names, phone, email, address, birth_date, emergency_contact_name,
       emergency_contact_phone, public_display_name, specialty, public_bio, years_experience, is_available,
       availability_note, status, status_changed_at, enabled_at, suspended_until, photo_path, photo_pending_path,
       photo_status, photo_review_note, proposed_bio, proposed_availability_note, proposal_submitted_at,
       proposal_review_note, created_at, parishes(code, name),
       registrador:users!worker_profiles_registered_by_fkey(display_name),
       worker_services(service_id, is_primary, services(name, slug))`,
    )
    .eq("id", workerId)
    .maybeSingle<DetailRow>();
  if (error) throw error;
  if (!w) throw new DomainError(404, "Trabajador no encontrado");

  const [historial, documentos, inscripciones, codigo] = await Promise.all([
    db
      .from("worker_status_history")
      .select(
        "id, from_status, to_status, reason, created_at, actor:users!worker_status_history_actor_id_fkey(display_name)",
      )
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .returns<
        {
          id: number;
          from_status: WorkerStatus | null;
          to_status: WorkerStatus;
          reason: string | null;
          created_at: string;
          actor: { display_name: string | null } | null;
        }[]
      >(),
    db
      .from("worker_documents")
      .select(
        "id, type_code, original_name, mime_type, size_bytes, status, issued_at, expires_at, review_note, reviewed_at, uploaded_by, created_at, replaces_id, document_types(name)",
      )
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          type_code: string;
          original_name: string | null;
          mime_type: string;
          size_bytes: number;
          status: "PENDIENTE" | "VALIDADO" | "RECHAZADO" | "VENCIDO" | "REEMPLAZADO";
          issued_at: string | null;
          expires_at: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          uploaded_by: string;
          created_at: string;
          replaces_id: string | null;
          document_types: { name: string } | null;
        }[]
      >(),
    db
      .from("training_enrollments")
      .select(
        "id, status, enrolled_at, started_at, finished_at, score, result_note, valid_until, evidence_document_id, trainings(id, name, code)",
      )
      .eq("worker_id", workerId)
      .order("enrolled_at", { ascending: false })
      .returns<
        {
          id: string;
          status: "INSCRITO" | "EN_PROCESO" | "APROBADO" | "REPROBADO" | "ABANDONADO";
          enrolled_at: string;
          started_at: string | null;
          finished_at: string | null;
          score: number | string | null;
          result_note: string | null;
          valid_until: string | null;
          evidence_document_id: string | null;
          trainings: { id: string; name: string; code: string } | null;
        }[]
      >(),
    db
      .from("worker_activation_codes")
      .select("expires_at, created_at")
      .eq("worker_id", workerId)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ expires_at: string; created_at: string }>(),
  ]);
  for (const r of [historial, documentos, inscripciones, codigo]) if (r.error) throw r.error;

  const privado = hasPermission(actor, "worker.read.private");
  if (privado) {
    await logAudit({
      action: "WORKER_PRIVATE_DATA_VIEWED",
      actorId: actor.id,
      actorRoles: actor.roles,
      resourceType: "worker",
      resourceId: workerId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }
  const hoy = new Date().toISOString().slice(0, 10);

  return {
    id: w.id,
    linked: !!w.user_id,
    displayName: w.public_display_name,
    specialty: w.specialty,
    publicBio: w.public_bio,
    yearsExperience: w.years_experience,
    isAvailable: w.is_available,
    availabilityNote: w.availability_note,
    parish: w.parishes,
    status: w.status,
    statusChangedAt: w.status_changed_at,
    enabledAt: w.enabled_at,
    suspendedUntil: w.suspended_until,
    createdAt: w.created_at,
    registeredBy: w.registrador?.display_name ?? null,
    services: [...w.worker_services]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((s) => ({
        id: s.service_id,
        name: s.services?.name ?? "",
        slug: s.services?.slug ?? "",
        isPrimary: s.is_primary,
      })),
    private: privado
      ? {
          firstNames: w.first_names,
          lastNames: w.last_names,
          birthDate: w.birth_date,
          phone: w.phone,
          email: w.email,
          address: w.address,
          emergencyContactName: w.emergency_contact_name,
          emergencyContactPhone: w.emergency_contact_phone,
        }
      : null,
    photo: {
      hasApproved: !!w.photo_path,
      hasPending: !!w.photo_pending_path && w.photo_status === "PENDIENTE",
      status: w.photo_status,
      reviewNote: w.photo_review_note,
    },
    proposal: w.proposal_submitted_at
      ? { bio: w.proposed_bio, availabilityNote: w.proposed_availability_note, submittedAt: w.proposal_submitted_at }
      : null,
    proposalReviewNote: w.proposal_review_note,
    history: (historial.data ?? []).map((h) => ({
      id: h.id,
      from: h.from_status,
      to: h.to_status,
      reason: h.reason,
      at: h.created_at,
      actor: h.actor?.display_name ?? null,
    })),
    documents: (documentos.data ?? []).map((d) => ({
      id: d.id,
      typeCode: d.type_code,
      typeName: d.document_types?.name ?? d.type_code,
      originalName: d.original_name,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes,
      // VENCIDO se calcula por fecha: un documento validado deja de valer al vencer.
      status: d.status === "VALIDADO" && d.expires_at && d.expires_at < hoy ? ("VENCIDO" as const) : d.status,
      issuedAt: d.issued_at,
      expiresAt: d.expires_at,
      reviewNote: d.review_note,
      reviewedAt: d.reviewed_at,
      uploadedByMe: d.uploaded_by === actor.id,
      createdAt: d.created_at,
    })),
    enrollments: (inscripciones.data ?? []).map((e) => ({
      id: e.id,
      training: e.trainings,
      status: e.status,
      enrolledAt: e.enrolled_at,
      finishedAt: e.finished_at,
      score: e.score == null ? null : Number(e.score),
      resultNote: e.result_note,
      validUntil: e.valid_until,
      evidenceDocumentId: e.evidence_document_id,
    })),
    activationCode: codigo.data ? { expiresAt: codigo.data.expires_at, issuedAt: codigo.data.created_at } : null,
  };
}

/** Datos para precargar el formulario de edición (requiere los datos personales). */
export async function getWorkerForEdit(actor: AppUser, workerId: string, ctx: RequestContext) {
  requirePermission(actor, "worker.update");
  requirePermission(actor, "worker.read.private");
  const d = await getWorkerDetail(actor, workerId, ctx);
  if (d.status === "RECHAZADO") throw new DomainError(409, "Un trabajador rechazado no se puede modificar");
  const p = d.private!;
  return {
    id: d.id,
    status: d.status,
    values: {
      firstNames: p.firstNames,
      lastNames: p.lastNames,
      birthDate: p.birthDate ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      address: p.address ?? "",
      parishCode: d.parish?.code ?? "",
      emergencyContactName: p.emergencyContactName ?? "",
      emergencyContactPhone: p.emergencyContactPhone ?? "",
      services: d.services.map((s) => s.id),
      primaryService: d.services.find((s) => s.isPrimary)?.id ?? "",
      publicDisplayName: d.displayName,
      specialty: d.specialty ?? "",
      publicBio: d.publicBio ?? "",
      yearsExperience: String(d.yearsExperience),
      isAvailable: d.isAvailable,
    },
  };
}

export type WorkerFormValues = Awaited<ReturnType<typeof getWorkerForEdit>>["values"];

export type DuplicateCandidate = {
  id: string;
  displayName: string;
  status: WorkerStatus;
  reasons: ("TELEFONO" | "EMAIL" | "NOMBRES")[];
};

export async function findDuplicates(
  actor: AppUser,
  d: { phone?: string; email?: string; firstNames: string; lastNames: string },
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  requirePermission(actor, "worker.read");
  const { data, error } = await getAdminDb().rpc("fn_admin_find_worker_duplicates", {
    p_actor_id: actor.id,
    p_phone: d.phone ?? null,
    p_email: d.email ?? null,
    p_first_names: d.firstNames,
    p_last_names: d.lastNames,
    p_exclude: excludeId ?? null,
  });
  if (error) throwPg(error);
  return ((data ?? []) as { id: string; public_display_name: string; status: WorkerStatus; reasons: string[] }[]).map(
    (r) => ({
      id: r.id,
      displayName: r.public_display_name,
      status: r.status,
      reasons: r.reasons as DuplicateCandidate["reasons"],
    }),
  );
}

export type CreateResult =
  { status: "created"; id: string } | { status: "duplicates"; candidates: DuplicateCandidate[] };

/**
 * Alta presencial. Si hay posibles duplicados (teléfono, email o nombres) y el operador no los
 * confirmó, no crea nada y devuelve los candidatos para que decida (01-negocio.md §7.1).
 */
export async function createWorker(actor: AppUser, input: unknown, ctx: RequestContext): Promise<CreateResult> {
  requirePermission(actor, "worker.create");
  const d = parseWorkerForm(input);
  if (!d.duplicatesConfirmed) {
    const candidatos = await findDuplicates(actor, d);
    if (candidatos.length) return { status: "duplicates", candidates: candidatos };
  }
  const rpc = toWorkerRpc(d);
  const { data, error } = await getAdminDb().rpc("fn_admin_create_worker", {
    p_actor_id: actor.id,
    p_data: rpc.data,
    p_services: rpc.services,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return { status: "created", id: data as string };
}

export async function updateWorker(actor: AppUser, workerId: string, input: unknown, ctx: RequestContext) {
  requirePermission(actor, "worker.update");
  requirePermission(actor, "worker.read.private");
  const rpc = toWorkerRpc(parseWorkerForm({ ...(input as object), duplicatesConfirmed: true }));
  const { error } = await getAdminDb().rpc("fn_admin_update_worker", {
    p_actor_id: actor.id,
    p_worker_id: workerId,
    p_data: rpc.data,
    p_services: rpc.services,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
}

/** Cambio de estado explícito (habilitar, suspender, rechazar, dar de baja, …). */
export async function changeWorkerStatus(actor: AppUser, input: unknown, ctx: RequestContext) {
  const d = statusChangeSchema.parse(input);
  const { data: actual, error: e1 } = await getAdminDb()
    .from("worker_profiles")
    .select("status")
    .eq("id", d.workerId)
    .maybeSingle<{ status: WorkerStatus }>();
  if (e1) throw e1;
  if (!actual) throw new DomainError(404, "Trabajador no encontrado");
  requirePermission(actor, transitionPermission(actual.status, d.to));
  const { error } = await getAdminDb().rpc("fn_admin_change_worker_status", {
    p_actor_id: actor.id,
    p_worker_id: d.workerId,
    p_to: d.to,
    p_reason: d.reason ?? null,
    p_suspended_until: d.to === "SUSPENDIDO" ? (d.suspendedUntil ?? null) : null,
    ...auditParams(ctx),
  });
  if (error) throwPg(error);
  return d.to;
}

export type ServiceOption = { id: string; name: string; category: string };
export type ParishOption = { code: string; name: string; kind: string };

/** Opciones del formulario: oficios activos agrupables por categoría y parroquias. */
export async function getWorkerFormOptions(): Promise<{ services: ServiceOption[]; parishes: ParishOption[] }> {
  const db = getAdminDb();
  const [s, p] = await Promise.all([
    db
      .from("services")
      .select("id, name, sort_order, categories!inner(name, sort_order, active)")
      .eq("active", true)
      .eq("categories.active", true)
      .returns<{ id: string; name: string; sort_order: number; categories: { name: string; sort_order: number } }[]>(),
    db.from("parishes").select("code, name, kind").eq("active", true).order("sort_order").returns<ParishOption[]>(),
  ]);
  if (s.error) throw s.error;
  if (p.error) throw p.error;
  const services = (s.data ?? [])
    .sort(
      (a, b) =>
        a.categories.sort_order - b.categories.sort_order ||
        a.categories.name.localeCompare(b.categories.name) ||
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name),
    )
    .map((r) => ({ id: r.id, name: r.name, category: r.categories.name }));
  return { services, parishes: p.data ?? [] };
}
