import "server-only";

import { aCsv, type Celda } from "@/lib/csv";
import { formatearFechaHora } from "@/lib/formatos";
import { requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { logAudit } from "@/server/audit/log";
import { getAdminDb } from "@/server/db/admin";
import { ETIQUETAS_ESTADO as ESTADO_CONTRATO, type ContractStatus } from "@/server/domain/contracts/state-machine";
import type { TipoReporte } from "@/server/domain/panel/schemas";
import {
  ETIQUETAS_ESTADO as ESTADO_DENUNCIA,
  ETIQUETAS_OBJETIVO,
  ETIQUETAS_RESOLUCION,
  PRIORIDADES,
  type ReportStatus,
  type ReportTargetType,
  type Resolucion,
} from "@/server/domain/reports/state-machine";
import { ETIQUETAS_ESTADO as ESTADO_TRABAJADOR, type WorkerStatus } from "@/server/domain/workers/state-machine";
import { throwPg } from "@/server/errors";
import type { RequestContext } from "@/server/http/request-info";

/**
 * Reportes filtrables del panel (Fase 9). Ver: metrics.read. Descargar CSV: data.export, y cada
 * descarga queda auditada (DATA_EXPORTED) con los filtros y el número de filas. Sin datos personales
 * de clientes; de los trabajadores, solo datos públicos.
 */

type Fila = Record<string, unknown>;
type Columna = { titulo: string; valor: (f: Fila) => Celda };

const fechaHora = (v: unknown) => (typeof v === "string" ? formatearFechaHora(v) : "");
const numero = (v: unknown) => (v == null ? null : Number(v));

export const REPORTES: Record<
  TipoReporte,
  { titulo: string; rpc: string; estados: Record<string, string>; columnas: Columna[] }
> = {
  trabajadores: {
    titulo: "Trabajadores",
    rpc: "fn_admin_report_workers",
    estados: ESTADO_TRABAJADOR,
    columnas: [
      { titulo: "Nombre público", valor: (f) => f.public_name as string },
      { titulo: "Estado", valor: (f) => ESTADO_TRABAJADOR[f.status as WorkerStatus] ?? (f.status as string) },
      { titulo: "Parroquia", valor: (f) => f.parish as string },
      { titulo: "Oficios", valor: (f) => f.services as string },
      { titulo: "Registrado", valor: (f) => fechaHora(f.registered_at) },
      { titulo: "Habilitado", valor: (f) => fechaHora(f.enabled_at) },
      { titulo: "Calificación", valor: (f) => numero(f.rating_avg) },
      { titulo: "Reseñas", valor: (f) => numero(f.rating_count) },
      { titulo: "Trabajos finalizados", valor: (f) => numero(f.contracts_completed) },
      { titulo: "Cuenta activada", valor: (f) => f.account_linked as boolean },
    ],
  },
  contrataciones: {
    titulo: "Contrataciones",
    rpc: "fn_admin_report_contracts",
    estados: ESTADO_CONTRATO,
    columnas: [
      { titulo: "Código", valor: (f) => (f.contract_id as string).slice(0, 8) },
      { titulo: "Estado", valor: (f) => ESTADO_CONTRATO[f.status as ContractStatus] ?? (f.status as string) },
      { titulo: "Trabajador", valor: (f) => f.worker_name as string },
      { titulo: "Oficio", valor: (f) => f.service as string },
      { titulo: "Parroquia", valor: (f) => f.parish as string },
      { titulo: "Precio (USD)", valor: (f) => numero(f.price_amount) },
      { titulo: "Modalidad", valor: (f) => f.price_unit as string },
      { titulo: "Versiones", valor: (f) => numero(f.versions) },
      { titulo: "Propuesta", valor: (f) => fechaHora(f.created_at) },
      { titulo: "Acordada", valor: (f) => fechaHora(f.agreed_at) },
      { titulo: "Finalizada", valor: (f) => fechaHora(f.completed_at) },
      { titulo: "Cancelada", valor: (f) => fechaHora(f.cancelled_at) },
      { titulo: "Con disputa", valor: (f) => f.disputed as boolean },
    ],
  },
  denuncias: {
    titulo: "Denuncias",
    rpc: "fn_admin_report_reports",
    estados: ESTADO_DENUNCIA,
    columnas: [
      { titulo: "Código", valor: (f) => (f.report_id as string).slice(0, 8) },
      {
        titulo: "Tipo",
        valor: (f) => ETIQUETAS_OBJETIVO[f.target_type as ReportTargetType] ?? (f.target_type as string),
      },
      { titulo: "Motivo", valor: (f) => f.reason as string },
      { titulo: "Estado", valor: (f) => ESTADO_DENUNCIA[f.status as ReportStatus] ?? (f.status as string) },
      { titulo: "Prioridad", valor: (f) => PRIORIDADES[f.priority as 1 | 2 | 3] },
      { titulo: "Recibida", valor: (f) => fechaHora(f.created_at) },
      { titulo: "Plazo", valor: (f) => fechaHora(f.due_at) },
      { titulo: "Cerrada", valor: (f) => fechaHora(f.resolved_at) },
      { titulo: "Resultado", valor: (f) => (f.resolution ? ETIQUETAS_RESOLUCION[f.resolution as Resolucion] : "") },
      { titulo: "Horas de atención", valor: (f) => numero(f.hours_to_resolve) },
      { titulo: "Dentro del plazo", valor: (f) => (f.within_deadline == null ? null : (f.within_deadline as boolean)) },
      { titulo: "Sanciones", valor: (f) => numero(f.sanctions) },
    ],
  },
};

export const FILAS_POR_PAGINA = 50;
const MAX_EXPORTACION = 10_000;

type Filtros = { desde: string; hasta: string; estado?: string | null };

async function consultar(actor: AppUser, tipo: TipoReporte, f: Filtros, limit: number, offset: number) {
  const r = REPORTES[tipo];
  const estado = f.estado && f.estado in r.estados ? f.estado : null;
  const { data, error } = await getAdminDb().rpc(r.rpc, {
    p_actor_id: actor.id,
    p_from: f.desde,
    p_to: f.hasta,
    p_status: estado,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throwPg(error);
  const filas = (data ?? []) as Fila[];
  return { filas, total: filas.length ? Number(filas[0].total) : 0, estado };
}

/** Filas ya formateadas para la tabla del panel. */
export async function reportPage(actor: AppUser, tipo: TipoReporte, f: Filtros, pagina = 1) {
  requirePermission(actor, "metrics.read");
  const p = Number.isSafeInteger(pagina) && pagina > 0 ? pagina : 1;
  const { filas, total } = await consultar(actor, tipo, f, FILAS_POR_PAGINA, (p - 1) * FILAS_POR_PAGINA);
  const columnas = REPORTES[tipo].columnas;
  return {
    encabezados: columnas.map((c) => c.titulo),
    filas: filas.map((x) => columnas.map((c) => c.valor(x))),
    total,
  };
}

/** CSV del reporte (hasta 10 000 filas). Exige data.export y queda auditado. */
export async function exportReport(actor: AppUser, tipo: TipoReporte, f: Filtros, ctx: RequestContext) {
  requirePermission(actor, "metrics.read");
  requirePermission(actor, "data.export");
  const { filas, total, estado } = await consultar(actor, tipo, f, MAX_EXPORTACION, 0);
  const columnas = REPORTES[tipo].columnas;
  await logAudit({
    action: "DATA_EXPORTED",
    actorId: actor.id,
    actorRoles: actor.roles,
    resourceType: "report",
    resourceId: tipo,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    metadata: { tipo, desde: f.desde, hasta: f.hasta, estado, filas: filas.length, total },
  });
  return {
    nombre: `${tipo}_${f.desde}_${f.hasta}.csv`,
    csv: aCsv(
      columnas.map((c) => c.titulo),
      filas.map((x) => columnas.map((c) => c.valor(x))),
    ),
  };
}
