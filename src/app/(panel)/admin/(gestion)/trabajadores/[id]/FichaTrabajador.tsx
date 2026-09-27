import Link from "next/link";
import { ArrowUpRight, FileText, Link2, Lightbulb, Pencil } from "lucide-react";

import { AdminHeader, Aviso, Bloque, Insignia } from "@/components/admin/AdminHeader";
import { ETIQUETAS_INSCRIPCION, EstadoDocumento, EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { ActionForm } from "@/components/forms/ActionForm";
import { AvanceHabilitacion, habilitacionDetenida } from "@/components/site/AvanceHabilitacion";
import { boton } from "@/components/ui/boton";
import { campoCompacto, etiqueta } from "@/components/ui/campo";
import { formatearFecha, formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { formatBytes } from "@/server/domain/documents/files";
import {
  ETIQUETAS_ESTADO,
  accionHacia,
  isPubliclyVisible,
  manualTransitions,
  requiresReason,
  type WorkerStatus,
} from "@/server/domain/workers/state-machine";
import type { WorkerDetail } from "@/server/workers/admin";
import { canOpenDocument, type listDocumentTypes } from "@/server/workers/documents";
import type { listTrainings } from "@/server/workers/training";

import {
  actualizarInscripcion,
  cambiarEstadoTrabajador,
  emitirCodigoActivacion,
  inscribirCapacitacion,
  revisarDocumento,
  revisarFoto,
  revisarPerfil,
  subirDocumento,
  subirFotoTrabajador,
} from "../actions";
import { EmitirCodigoForm } from "./CodigoEmitido";

/** Qué suele tocar a continuación, para guiar al personal en cada estado. */
const siguientePaso: Record<WorkerStatus, string> = {
  REGISTRADO: "Carga los documentos del trabajador y envíalo a revisión.",
  DOCUMENTACION_PENDIENTE: "Completa o corrige los documentos y vuelve a enviarlo a revisión.",
  PENDIENTE_REVISION: "Revisa cada documento. Si todo está en orden, aprueba la documentación.",
  CAPACITACION_PENDIENTE: "Inscribe al trabajador en la capacitación.",
  CAPACITACION_EN_PROCESO: "Registra el resultado de la capacitación cuando termine.",
  CAPACITACION_APROBADA: "Revisa el perfil público (foto y descripción) y habilita al trabajador.",
  HABILITADO: "El trabajador aparece en la búsqueda pública.",
  SUSPENDIDO: "No aparece en la búsqueda. Puedes reactivarlo cuando corresponda.",
  RECHAZADO: "Registro cerrado. No admite más cambios.",
  INACTIVO: "Dado de baja. Puede reactivarse si mantiene su capacitación vigente.",
};

/** Desplegable de una acción secundaria dentro de un bloque (cargar, registrar, rechazar…). */
const desplegable = "rounded-xl border border-border p-3 open:bg-secondary/30";
const resumenDesplegable = "flex min-h-8 cursor-pointer items-center text-sm font-bold text-primary";

type Tipos = Awaited<ReturnType<typeof listDocumentTypes>>;
type Cursos = Awaited<ReturnType<typeof listTrainings>>;

/** Ficha administrativa del trabajador: estado, documentos, capacitación, perfil público y cuenta. */
export function FichaTrabajador({
  w,
  actor,
  tipos,
  cursos,
  aviso,
}: {
  w: WorkerDetail;
  actor: AppUser;
  tipos: Tipos;
  cursos: Cursos;
  aviso?: "registrado" | "guardado";
}) {
  const editable = hasPermission(actor, "worker.update") && !!w.private && w.status !== "RECHAZADO";

  return (
    <>
      <AdminHeader
        migas={[{ href: "/admin/trabajadores", label: "Trabajadores" }, { label: w.displayName }]}
        titulo={w.displayName}
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <EstadoTrabajador status={w.status} />
            {w.services.length > 0 && <span>{w.services.map((s) => s.name).join(" · ")}</span>}
          </span>
        }
        acciones={
          <>
            {isPubliclyVisible(w.status) && (
              <Link href={`/trabajadores/${w.id}`} className={boton({ variante: "secundario", tamano: "sm" })}>
                <ArrowUpRight aria-hidden /> Ver perfil público
              </Link>
            )}
            {editable && (
              <Link
                href={`/admin/trabajadores/${w.id}/editar`}
                className={boton({ variante: "secundario", tamano: "sm" })}
              >
                <Pencil aria-hidden /> Editar datos
              </Link>
            )}
          </>
        }
      >
        {!habilitacionDetenida(w.status) && (
          <AvanceHabilitacion status={w.status} etiqueta="Avance de la habilitación" className="mt-6 max-w-2xl" />
        )}
      </AdminHeader>

      {aviso && (
        <Aviso tipo="exito" className="mb-6">
          {aviso === "registrado"
            ? "Trabajador registrado. Continúa con los documentos, la foto y el código de activación."
            : "Cambios guardados."}
        </Aviso>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="order-2 space-y-6 lg:order-1">
          <Documentos w={w} actor={actor} tipos={tipos} />
          <Capacitacion w={w} actor={actor} cursos={cursos} />
          <Datos w={w} />
          <Historial w={w} />
        </div>
        <div className="order-1 space-y-6 lg:order-2">
          <Estado w={w} actor={actor} />
          <PerfilPublico w={w} actor={actor} />
          <Cuenta w={w} actor={actor} />
        </div>
      </div>
    </>
  );
}

function Datos({ w }: { w: WorkerDetail }) {
  const p = w.private;
  const filas: [string, string][] = [
    ...(p
      ? ([
          ["Nombres", `${p.firstNames} ${p.lastNames}`],
          ["Celular", p.phone ?? "—"],
          ["Correo", p.email ?? "—"],
          ["Fecha de nacimiento", formatearFecha(p.birthDate)],
          ["Dirección", p.address ?? "—"],
          [
            "Contacto de emergencia",
            p.emergencyContactName ? `${p.emergencyContactName} · ${p.emergencyContactPhone ?? "—"}` : "—",
          ],
        ] as [string, string][])
      : []),
    ["Parroquia", w.parish?.name ?? "—"],
    ["Especialidad", w.specialty ?? "—"],
    ["Experiencia", `${w.yearsExperience} años`],
    ["Disponible", w.isAvailable ? "Sí" : "No"],
    ["Registrado", `${formatearFecha(w.createdAt)}${w.registeredBy ? ` por ${w.registeredBy}` : ""}`],
  ];
  return (
    <Bloque
      titulo="Datos del trabajador"
      descripcion={
        p
          ? "La consulta de datos personales queda registrada."
          : "Los datos personales solo los ve el personal con permiso para ello."
      }
    >
      <dl className="grid gap-x-6 gap-y-3.5 text-sm sm:grid-cols-2">
        {filas.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 font-semibold break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </Bloque>
  );
}

function Estado({ w, actor }: { w: WorkerDetail; actor: AppUser }) {
  const acciones = manualTransitions(w.status, actor.permissions);
  const visible = isPubliclyVisible(w.status);
  return (
    <Bloque
      titulo="Estado"
      descripcion={
        <>
          {ETIQUETAS_ESTADO[w.status]} desde {formatearFechaHora(w.statusChangedAt)}
          {w.status === "SUSPENDIDO" && w.suspendedUntil && (
            <> · suspensión prevista hasta {formatearFecha(w.suspendedUntil)}</>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <p
          className={cn(
            "flex items-center gap-2 text-sm font-semibold",
            visible ? "text-verde-fuerte" : "text-muted-foreground",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", visible ? "bg-verde" : "bg-muted-foreground/50")} aria-hidden />
          {visible ? "Visible en la búsqueda pública" : "No visible en la búsqueda pública"}
        </p>
        <p className="flex gap-2.5 rounded-xl bg-primary/5 p-3 text-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block font-bold">Siguiente paso</span>
            {siguientePaso[w.status]}
          </span>
        </p>
        {acciones.map((to) => {
          const motivo = requiresReason(w.status, to);
          const peligrosa = to === "RECHAZADO" || to === "SUSPENDIDO" || to === "INACTIVO";
          return (
            <details
              key={to}
              className={cn(desplegable, peligrosa && "border-destructive/25")}
              open={acciones.length === 1 && !peligrosa}
            >
              <summary className={cn(resumenDesplegable, peligrosa && "text-destructive")}>
                {accionHacia(w.status, to)}
              </summary>
              <ActionForm
                action={cambiarEstadoTrabajador}
                submitLabel={accionHacia(w.status, to)}
                pendingLabel="Guardando…"
                variant={peligrosa ? "danger" : "primary"}
                className="mt-3"
              >
                <input type="hidden" name="workerId" value={w.id} />
                <input type="hidden" name="to" value={to} />
                <p className="text-sm text-muted-foreground">
                  Pasará a «{ETIQUETAS_ESTADO[to]}». El cambio queda en el historial y en la auditoría.
                </p>
                <div>
                  <label htmlFor={`reason-${to}`} className={etiqueta}>
                    {motivo ? "Motivo" : "Observación (opcional)"}
                  </label>
                  <textarea
                    id={`reason-${to}`}
                    name="reason"
                    rows={2}
                    maxLength={500}
                    required={motivo}
                    minLength={motivo ? 5 : undefined}
                    className={campoCompacto}
                  />
                </div>
                {to === "SUSPENDIDO" && (
                  <div>
                    <label htmlFor="suspendedUntil" className={etiqueta}>
                      Hasta (opcional)
                    </label>
                    <input id="suspendedUntil" name="suspendedUntil" type="date" className={campoCompacto} />
                  </div>
                )}
              </ActionForm>
            </details>
          );
        })}
      </div>
    </Bloque>
  );
}

function Documentos({ w, actor, tipos }: { w: WorkerDetail; actor: AppUser; tipos: Tipos }) {
  const puedeSubir = hasPermission(actor, "document.upload") && w.status !== "RECHAZADO";
  const puedeRevisar = hasPermission(actor, "document.review");
  const vigentes = w.documents.filter((d) => d.status !== "REEMPLAZADO");
  const obligatorios = tipos.filter((t) => t.required);
  return (
    <Bloque
      titulo="Documentos"
      descripcion={
        <>
          {obligatorios.length
            ? `Obligatorios: ${obligatorios.map((t) => t.name).join(", ")}.`
            : "Ningún documento es obligatorio por ahora (pendiente de definición del GAD)."}{" "}
          Cada apertura queda registrada.
        </>
      }
    >
      <div className="space-y-4">
        {w.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay documentos cargados.</p>
        ) : (
          <ul className="-my-3 divide-y divide-border/70">
            {w.documents.map((d) => (
              <li key={d.id} className={d.status === "REEMPLAZADO" ? "py-3 opacity-60" : "py-3"}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      {d.typeName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.originalName ?? "archivo"} · {formatBytes(d.sizeBytes)} · cargado {formatearFecha(d.createdAt)}
                      {d.expiresAt ? ` · vence ${formatearFecha(d.expiresAt)}` : ""}
                    </p>
                    {d.reviewNote && <p className="mt-1 text-xs">Observación: {d.reviewNote}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <EstadoDocumento status={d.status} />
                    {canOpenDocument(actor, d.uploadedByMe) && (
                      <a
                        href={`/admin/trabajadores/${w.id}/documentos/${d.id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm font-bold text-primary hover:bg-primary/10"
                      >
                        Abrir<span className="sr-only"> {d.typeName}</span>
                      </a>
                    )}
                  </div>
                </div>
                {puedeRevisar && d.status === "PENDIENTE" && (
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    <ActionForm
                      action={revisarDocumento}
                      submitLabel="Validar"
                      pendingLabel="…"
                      tamano="sm"
                      className="space-y-0"
                    >
                      <input type="hidden" name="documentId" value={d.id} />
                      <input type="hidden" name="status" value="VALIDADO" />
                    </ActionForm>
                    <details className="flex-1">
                      <summary
                        className={cn(boton({ variante: "secundario", tamano: "sm" }), "cursor-pointer list-none")}
                      >
                        Rechazar
                      </summary>
                      <ActionForm
                        action={revisarDocumento}
                        submitLabel="Rechazar documento"
                        variant="danger"
                        className="mt-2"
                      >
                        <input type="hidden" name="documentId" value={d.id} />
                        <input type="hidden" name="status" value="RECHAZADO" />
                        <div>
                          <label htmlFor={`note-${d.id}`} className={etiqueta}>
                            Motivo
                          </label>
                          <textarea
                            id={`note-${d.id}`}
                            name="note"
                            rows={2}
                            maxLength={500}
                            required
                            className={campoCompacto}
                          />
                        </div>
                      </ActionForm>
                    </details>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {puedeSubir && (
          <details
            className={cn(desplegable, "border-dashed", w.documents.length > 0 && "mt-6")}
            open={w.documents.length === 0}
          >
            <summary className={resumenDesplegable}>Cargar documento</summary>
            <ActionForm action={subirDocumento} submitLabel="Cargar" pendingLabel="Subiendo…" className="mt-3">
              <input type="hidden" name="workerId" value={w.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="typeCode" className={etiqueta}>
                    Tipo
                  </label>
                  <select id="typeCode" name="typeCode" required className={campoCompacto}>
                    {tipos.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name}
                        {t.required ? " (obligatorio)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="replacesId" className={etiqueta}>
                    Reemplaza a <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <select id="replacesId" name="replacesId" className={campoCompacto}>
                    <option value="">Ninguno</option>
                    {vigentes.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.typeName} · {formatearFecha(d.createdAt)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="issuedAt" className={etiqueta}>
                    Emitido <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input id="issuedAt" name="issuedAt" type="date" className={campoCompacto} />
                </div>
                <div>
                  <label htmlFor="expiresAt" className={etiqueta}>
                    Vence <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input id="expiresAt" name="expiresAt" type="date" className={campoCompacto} />
                </div>
              </div>
              <div>
                <label htmlFor="file" className={etiqueta}>
                  Archivo <span className="font-normal text-muted-foreground">(PDF, JPG, PNG o WEBP; máximo 4 MB)</span>
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  required
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className={campoCompacto}
                />
              </div>
            </ActionForm>
          </details>
        )}
      </div>
    </Bloque>
  );
}

function Capacitacion({ w, actor, cursos }: { w: WorkerDetail; actor: AppUser; cursos: Cursos }) {
  const puedeRegistrar = hasPermission(actor, "training.record");
  const puedeAprobar = hasPermission(actor, "training.approve");
  const abiertas = new Set(
    w.enrollments.filter((e) => e.status === "INSCRITO" || e.status === "EN_PROCESO").map((e) => e.training?.id),
  );
  const inscribibles = cursos.filter((c) => !abiertas.has(c.id));
  const evidencias = w.documents.filter((d) => d.status !== "REEMPLAZADO");
  const puedeInscribir =
    puedeRegistrar && w.status !== "RECHAZADO" && w.status !== "INACTIVO" && inscribibles.length > 0;

  return (
    <Bloque titulo="Capacitación">
      <div className="space-y-4">
        {w.enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no está inscrito en ningún curso.</p>
        ) : (
          <ul className="-my-3 divide-y divide-border/70">
            {w.enrollments.map((e) => {
              const abierta = e.status === "INSCRITO" || e.status === "EN_PROCESO";
              const resultados = [
                ...(e.status === "INSCRITO" ? (["EN_PROCESO"] as const) : []),
                ...(puedeAprobar ? (["APROBADO"] as const) : []),
                "REPROBADO",
                "ABANDONADO",
              ] as const;
              return (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{e.training?.name ?? "Curso"}</p>
                    <Insignia className="bg-secondary text-foreground">{ETIQUETAS_INSCRIPCION[e.status]}</Insignia>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Inscrito {formatearFecha(e.enrolledAt)}
                    {e.finishedAt ? ` · finalizó ${formatearFecha(e.finishedAt)}` : ""}
                    {e.score != null ? ` · nota ${e.score}` : ""}
                    {e.validUntil ? ` · vigente hasta ${formatearFecha(e.validUntil)}` : ""}
                  </p>
                  {e.resultNote && <p className="mt-1 text-xs">{e.resultNote}</p>}
                  {puedeRegistrar && abierta && (
                    <details className={cn(desplegable, "mt-3")}>
                      <summary className={resumenDesplegable}>Registrar avance o resultado</summary>
                      <ActionForm action={actualizarInscripcion} submitLabel="Guardar resultado" className="mt-3">
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor={`status-${e.id}`} className={etiqueta}>
                              Resultado
                            </label>
                            <select id={`status-${e.id}`} name="status" className={campoCompacto}>
                              {resultados.map((r) => (
                                <option key={r} value={r}>
                                  {ETIQUETAS_INSCRIPCION[r]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`score-${e.id}`} className={etiqueta}>
                              Nota <span className="font-normal text-muted-foreground">(0–100, opcional)</span>
                            </label>
                            <input
                              id={`score-${e.id}`}
                              name="score"
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              className={campoCompacto}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`evidence-${e.id}`} className={etiqueta}>
                            Evidencia{" "}
                            <span className="font-normal text-muted-foreground">(documento cargado, opcional)</span>
                          </label>
                          <select id={`evidence-${e.id}`} name="evidenceDocumentId" className={campoCompacto}>
                            <option value="">Sin evidencia</option>
                            {evidencias.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.typeName} · {formatearFecha(d.createdAt)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`note-e-${e.id}`} className={etiqueta}>
                            Observación{" "}
                            <span className="font-normal text-muted-foreground">
                              (obligatoria si reprueba o abandona)
                            </span>
                          </label>
                          <textarea
                            id={`note-e-${e.id}`}
                            name="note"
                            rows={2}
                            maxLength={500}
                            className={campoCompacto}
                          />
                        </div>
                        {!puedeAprobar && (
                          <p className="text-xs text-muted-foreground">
                            Aprobar requiere el permiso de aprobación de capacitaciones.
                          </p>
                        )}
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {puedeInscribir && (
          <ActionForm
            action={inscribirCapacitacion}
            submitLabel="Inscribir"
            pendingLabel="Inscribiendo…"
            className={cn("flex flex-col gap-2 space-y-0 sm:flex-row sm:items-end", w.enrollments.length > 0 && "mt-6")}
          >
            <input type="hidden" name="workerId" value={w.id} />
            <div className="flex-1">
              <label htmlFor="trainingId" className={etiqueta}>
                Inscribir en un curso
              </label>
              <select id="trainingId" name="trainingId" className={campoCompacto}>
                {inscribibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.required ? " (obligatorio)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </ActionForm>
        )}
      </div>
    </Bloque>
  );
}

function Historial({ w }: { w: WorkerDetail }) {
  return (
    <Bloque titulo="Historial de estados">
      <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
        {w.history.map((h) => (
          <li key={h.id} className="relative pl-6 text-sm">
            <span
              className="absolute top-1.5 left-0 h-[11px] w-[11px] rounded-full border-2 border-card bg-primary/60"
              aria-hidden
            />
            <p className="font-bold">
              {h.from ? `${ETIQUETAS_ESTADO[h.from]} → ` : ""}
              {ETIQUETAS_ESTADO[h.to]}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatearFechaHora(h.at)}
              {h.actor ? ` · ${h.actor}` : ""}
            </p>
            {h.reason && <p className="mt-0.5 text-xs">{h.reason}</p>}
          </li>
        ))}
      </ol>
    </Bloque>
  );
}

function Cuenta({ w, actor }: { w: WorkerDetail; actor: AppUser }) {
  const puedeEmitir =
    hasPermission(actor, "worker.activation_code") && !w.linked && w.status !== "RECHAZADO" && w.status !== "INACTIVO";
  return (
    <Bloque titulo="Cuenta del trabajador">
      <div className="space-y-3 text-sm">
        {w.linked ? (
          <p className="flex items-center gap-2 font-semibold text-verde-fuerte">
            <Link2 className="h-4 w-4" aria-hidden /> Cuenta vinculada
          </p>
        ) : (
          <p className="text-muted-foreground">
            El trabajador aún no vinculó su cuenta. Entrégale un código: lo ingresa en «Mi cuenta» tras iniciar sesión.
          </p>
        )}
        {!w.linked && w.activationCode && (
          <p className="text-xs text-muted-foreground">
            Hay un código vigente hasta {formatearFechaHora(w.activationCode.expiresAt)}. Emitir uno nuevo lo anula.
          </p>
        )}
        {puedeEmitir && <EmitirCodigoForm action={emitirCodigoActivacion} workerId={w.id} />}
      </div>
    </Bloque>
  );
}

function PerfilPublico({ w, actor }: { w: WorkerDetail; actor: AppUser }) {
  const puedeModerar = hasPermission(actor, "worker.update") && w.status !== "RECHAZADO";
  return (
    <Bloque titulo="Perfil público" descripcion="Lo que ven los clientes en el portal.">
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          {w.photo.hasApproved ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen servida por el propio portal
            <img
              src={`/admin/trabajadores/${w.id}/foto?v=approved`}
              alt={`Foto publicada de ${w.displayName}`}
              className="h-20 w-20 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-muted text-xs text-muted-foreground">
              Sin foto
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            {w.photo.hasApproved ? "Foto publicada." : "Sin foto publicada: se muestran las iniciales."}
            {w.photo.status === "RECHAZADA" && w.photo.reviewNote
              ? ` Última foto rechazada: ${w.photo.reviewNote}`
              : ""}
          </p>
        </div>

        {w.photo.hasPending && (
          <div className="space-y-3 rounded-xl bg-naranja/10 p-3">
            <p className="font-bold">Foto enviada por el trabajador</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen servida por el propio portal */}
            <img
              src={`/admin/trabajadores/${w.id}/foto?v=pending`}
              alt={`Foto propuesta por ${w.displayName}`}
              className="h-32 w-32 rounded-2xl object-cover"
            />
            {puedeModerar && <Moderacion accion={revisarFoto} workerId={w.id} etiqueta="foto" />}
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground">Descripción publicada</p>
          <p className="mt-1 whitespace-pre-line">{w.publicBio ?? "—"}</p>
          {w.availabilityNote && <p className="mt-1 text-xs">Disponibilidad: {w.availabilityNote}</p>}
        </div>

        {w.proposal && (
          <div className="space-y-3 rounded-xl bg-naranja/10 p-3">
            <p className="font-bold">Cambios enviados el {formatearFecha(w.proposal.submittedAt)}</p>
            <p className="whitespace-pre-line">{w.proposal.bio ?? "(sin descripción)"}</p>
            {w.proposal.availabilityNote && <p className="text-xs">Disponibilidad: {w.proposal.availabilityNote}</p>}
            {puedeModerar && <Moderacion accion={revisarPerfil} workerId={w.id} etiqueta="cambios" />}
          </div>
        )}

        {puedeModerar && (
          <details className={cn(desplegable, "border-dashed")}>
            <summary className={resumenDesplegable}>{w.photo.hasApproved ? "Cambiar foto" : "Cargar foto"}</summary>
            <ActionForm
              action={subirFotoTrabajador}
              submitLabel="Guardar foto"
              pendingLabel="Subiendo…"
              className="mt-3"
            >
              <input type="hidden" name="workerId" value={w.id} />
              <div>
                <label htmlFor="foto" className={etiqueta}>
                  Foto <span className="font-normal text-muted-foreground">(JPG, PNG o WEBP; máximo 4 MB)</span>
                </label>
                <input
                  id="foto"
                  name="file"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  className={campoCompacto}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Tomada en la atención presencial con consentimiento del trabajador: se publica sin revisión adicional.
              </p>
            </ActionForm>
          </details>
        )}
      </div>
    </Bloque>
  );
}

function Moderacion({
  accion,
  workerId,
  etiqueta: nombre,
}: {
  accion: typeof revisarFoto;
  workerId: string;
  etiqueta: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionForm action={accion} submitLabel={`Aprobar ${nombre}`} pendingLabel="…" tamano="sm" className="space-y-0">
        <input type="hidden" name="workerId" value={workerId} />
        <input type="hidden" name="decision" value="APROBAR" />
      </ActionForm>
      <details className="flex-1">
        <summary className={cn(boton({ variante: "secundario", tamano: "sm" }), "cursor-pointer list-none")}>
          Rechazar
        </summary>
        <ActionForm action={accion} submitLabel={`Rechazar ${nombre}`} variant="danger" className="mt-2">
          <input type="hidden" name="workerId" value={workerId} />
          <input type="hidden" name="decision" value="RECHAZAR" />
          <div>
            <label htmlFor={`motivo-${nombre}`} className={etiqueta}>
              Motivo <span className="font-normal text-muted-foreground">(lo verá el trabajador)</span>
            </label>
            <textarea id={`motivo-${nombre}`} name="note" rows={2} maxLength={300} required className={campoCompacto} />
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
