import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlarmClock, ExternalLink, Gavel, History, UserRound } from "lucide-react";

import { AdminHeader, Bloque } from "@/components/admin/AdminHeader";
import { EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { EstadoDenuncia, PrioridadDenuncia } from "@/components/reports/EstadoDenuncia";
import { Estrellas } from "@/components/site/Estrellas";
import { formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import type { WorkerStatus } from "@/server/domain/workers/state-machine";
import {
  accionesPara,
  ETIQUETAS_ACCION,
  ETIQUETAS_EVENTO,
  ETIQUETAS_OBJETIVO,
  ETIQUETAS_RESOLUCION,
  isOpen,
} from "@/server/domain/reports/state-machine";
import { DomainError } from "@/server/errors";
import { getReport } from "@/server/reports/admin";

import {
  BotonOperacion,
  FormularioSancion,
  LevantarSancion,
  OperacionDenuncia,
  PanelEvidencia,
  PrioridadForm,
  ResolverDisputa,
} from "./ControlesDenuncia";

export const metadata: Metadata = { title: "Denuncia · Panel GAD" };

export default async function DenunciaAdminPage({ params }: PageProps<"/admin/denuncias/[id]">) {
  const { id } = await params;
  const actor = await requirePagePermission("report.read", `/admin/denuncias/${id}`);
  const r = await getReport(actor, id).catch((e: unknown) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  const gestiona = hasPermission(actor, "report.manage");
  const abierta = isOpen(r.status);
  const acciones = abierta
    ? accionesPara({
        targetType: r.targetType,
        tieneCuentaDenunciada: !!r.reported && !r.reported.isStaff && r.reported.status === "ACTIVO",
        trabajadorEstado: r.worker?.status ?? null,
        mensajeOculto: r.messageHidden,
        resenaEstado: r.review?.status ?? null,
        permisos: actor.permissions,
      })
    : [];
  const disputaAbierta = r.targetType === "CONTRACT" && r.contractStatus === "EN_DISPUTA" && r.contractId;

  return (
    <>
      <AdminHeader
        migas={[{ label: "Denuncias", href: "/admin/denuncias" }, { label: r.reasonLabel }]}
        titulo={r.reasonLabel}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <EstadoDenuncia status={r.status} />
            <PrioridadDenuncia prioridad={r.priority} />
            <span>{ETIQUETAS_OBJETIVO[r.targetType]}</span>
            {r.overdue && (
              <span className="inline-flex items-center gap-1 font-bold text-destructive">
                <AlarmClock className="h-4 w-4" aria-hidden /> Plazo vencido
              </span>
            )}
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Bloque titulo="Lo que se denunció">
            <p className="text-sm font-bold">{r.targetLabel}</p>
            <blockquote className="mt-2 rounded-xl bg-secondary p-3 text-sm break-words whitespace-pre-wrap">
              {r.description ?? "Sin descripción."}
            </blockquote>
            <p className="mt-2 text-xs text-muted-foreground">
              Recibida el {formatearFechaHora(r.createdAt)} · plazo {formatearFechaHora(r.dueAt)}
            </p>
            {r.review && (
              <div className="mt-4 rounded-xl border border-border p-3 text-sm">
                <p className="flex items-center gap-2 font-bold">
                  Reseña denunciada <Estrellas valor={r.review.rating} tamaño="sm" />
                  <span className="font-normal text-muted-foreground">
                    ({r.review.status === "OCULTA" ? "oculta" : "publicada"})
                  </span>
                </p>
                <p className="mt-1 break-words whitespace-pre-wrap">{r.review.comment ?? "Sin comentario"}</p>
              </div>
            )}
            {r.targetType === "MESSAGE" && (
              <p className="mt-3 text-sm text-muted-foreground">
                El texto del mensaje se ve en la evidencia (acceso justificado)
                {r.messageHidden ? " · el mensaje ya está oculto" : ""}.
              </p>
            )}
            {r.relatedOpen > 0 && (
              <p className="mt-3 rounded-xl bg-amarillo/20 p-3 text-sm">
                Hay {r.relatedOpen} denuncia{r.relatedOpen === 1 ? "" : "s"} abierta{r.relatedOpen === 1 ? "" : "s"} más
                sobre el mismo objeto o la misma persona.
              </p>
            )}
          </Bloque>

          <PanelEvidencia
            reportId={r.id}
            puede={hasPermission(actor, "report.evidence.read")}
            hayConversacion={r.hasConversation}
            hayContrato={!!r.contractId}
            archivos={r.evidenceCount}
          />

          <Bloque titulo="Historial">
            <ol className="space-y-3 border-l-2 border-border pl-4">
              {[...r.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[1.4rem] h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                  <p className="text-sm font-bold">
                    {ETIQUETAS_EVENTO[e.event] ?? e.event}
                    {e.event === "ESTADO" && e.toStatus ? ` → ${e.toStatus.replaceAll("_", " ").toLowerCase()}` : ""}
                    {e.visibleToReporter && e.event !== "CREADA" && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (visible para el denunciante)
                      </span>
                    )}
                  </p>
                  {e.note && <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{e.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    {e.byReporter ? "Denunciante" : (e.actorName ?? "Sistema")} · {formatearFechaHora(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Bloque>

          {r.accesses.length > 0 && (
            <Bloque titulo="Accesos a la evidencia">
              <ul className="space-y-2 text-sm">
                {r.accesses.map((a, i) => (
                  <li key={i}>
                    <strong>{a.actorName ?? "Funcionario"}</strong> · {formatearFechaHora(a.occurredAt)}
                    <p className="text-muted-foreground">{a.justification}</p>
                  </li>
                ))}
              </ul>
            </Bloque>
          )}
        </div>

        <aside className="space-y-6">
          <Bloque titulo="Personas">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-bold text-muted-foreground">Denunciante</dt>
                <dd className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {r.reporter?.name ?? "—"}
                  <span className="text-xs text-muted-foreground">
                    ({r.reporter?.reportsMade ?? 0} denuncias hechas)
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted-foreground">Denunciado</dt>
                <dd>
                  {r.reported ? (
                    <>
                      {r.reported.name ?? "—"}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({r.reported.reportsReceived} denuncias · {r.reported.actionsReceived} sanciones
                        {r.reported.status !== "ACTIVO" ? ` · cuenta ${r.reported.status.toLowerCase()}` : ""})
                      </span>
                    </>
                  ) : (
                    "Sin cuenta vinculada"
                  )}
                </dd>
              </div>
              {r.worker && (
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">Trabajador</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {hasPermission(actor, "worker.read") ? (
                      <Link
                        href={`/admin/trabajadores/${r.worker.id}`}
                        className="font-bold text-primary hover:underline"
                      >
                        {r.worker.name}
                      </Link>
                    ) : (
                      r.worker.name
                    )}
                    <EstadoTrabajador status={r.worker.status as WorkerStatus} />
                    {r.worker.suspendedUntil && (
                      <span className="text-xs text-muted-foreground">
                        hasta {formatearFechaHora(r.worker.suspendedUntil)}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </Bloque>

          {gestiona && abierta && (
            <Bloque titulo="Gestión">
              <div className="space-y-4">
                <p className="text-sm">
                  Asignada a: <strong>{r.assignedName ?? "nadie"}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.assignedTo !== actor.id && (
                    <BotonOperacion reportId={r.id} op="ASSIGN_ME" etiqueta="Asignármela" variante="primary" />
                  )}
                  {r.assignedTo && <BotonOperacion reportId={r.id} op="UNASSIGN" etiqueta="Quitar asignación" />}
                </div>
                <PrioridadForm reportId={r.id} prioridad={r.priority} />
                <div className="border-t border-border pt-4">
                  {disputaAbierta ? (
                    <>
                      <p className="mb-3 flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm">
                        <Gavel className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        Es una disputa: al resolverla se cierra la contratación y esta denuncia.
                      </p>
                      <ResolverDisputa reportId={r.id} contractId={r.contractId!} />
                    </>
                  ) : (
                    <OperacionDenuncia reportId={r.id} status={r.status} />
                  )}
                </div>
              </div>
            </Bloque>
          )}

          {!abierta && (
            <Bloque titulo="Resultado">
              <p className="text-sm font-bold">
                {r.resolution
                  ? ETIQUETAS_RESOLUCION[r.resolution]
                  : r.status === "DESCARTADA"
                    ? "Cerrada sin acciones"
                    : "Resuelta"}
              </p>
              {r.resolutionNote && <p className="mt-1 text-sm text-muted-foreground">{r.resolutionNote}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{formatearFechaHora(r.resolvedAt)}</p>
              {gestiona && <OperacionDenuncia reportId={r.id} status={r.status} />}
            </Bloque>
          )}

          <Bloque titulo="Sanciones y acciones">
            {r.actions.length > 0 ? (
              <ul className="space-y-3 text-sm">
                {r.actions.map((a) => (
                  <li key={a.id} className={cn("rounded-xl border border-border p-3", a.liftedAt && "opacity-70")}>
                    <p className="font-bold">{ETIQUETAS_ACCION[a.action]}</p>
                    <p className="text-muted-foreground">{a.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.actorName ?? "—"} · {formatearFechaHora(a.createdAt)}
                      {a.endsAt ? ` · hasta ${formatearFechaHora(a.endsAt)}` : ""}
                    </p>
                    {a.liftedAt ? (
                      <p className="mt-1 text-xs font-bold">
                        Levantada {formatearFechaHora(a.liftedAt)}
                        {a.liftReason ? `: ${a.liftReason}` : ""}
                      </p>
                    ) : (
                      a.action !== "ADVERTENCIA" &&
                      a.action !== "DESHABILITAR_TRABAJADOR" && <LevantarSancion actionId={a.id} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin acciones aplicadas.</p>
            )}
            {acciones.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <FormularioSancion reportId={r.id} acciones={acciones} />
              </div>
            )}
            {r.worker && hasPermission(actor, "worker.read") && (
              <Link
                href={`/admin/trabajadores/${r.worker.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
              >
                <History className="h-4 w-4" aria-hidden /> Ficha del trabajador{" "}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </Bloque>
        </aside>
      </div>
    </>
  );
}
