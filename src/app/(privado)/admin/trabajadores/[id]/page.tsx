import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FileText, Link2, Lightbulb, Pencil } from "lucide-react";
import { z } from "zod";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { ETIQUETAS_INSCRIPCION, EstadoDocumento, EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { ActionForm } from "@/components/forms/ActionForm";
import { Section } from "@/components/site/SiteShell";
import { formatearFecha, formatearFechaHora } from "@/lib/formatos";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
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
import { DomainError } from "@/server/errors";
import { currentRequestContext } from "@/server/http/request-info";
import { getWorkerDetail, type WorkerDetail } from "@/server/workers/admin";
import { canOpenDocument, listDocumentTypes } from "@/server/workers/documents";
import { listTrainings } from "@/server/workers/training";

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

export const metadata: Metadata = { title: "Ficha del trabajador · Panel GAD" };

const campo =
  "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

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

export default async function TrabajadorPage({ params, searchParams }: PageProps<"/admin/trabajadores/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePagePermission("worker.read", `/admin/trabajadores/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const w = await getWorkerDetail(actor, id, await currentRequestContext()).catch((e) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  const [tipos, cursos] = await Promise.all([listDocumentTypes(), listTrainings({ onlyActive: true })]);

  return (
    <>
      <AdminHeader
        migas={[{ href: "/admin/trabajadores", label: "Trabajadores" }, { label: w.displayName }]}
        titulo={w.displayName}
        descripcion={w.services.map((s) => s.name).join(" · ")}
      />

      {(sp.registrado === "1" || sp.guardado === "1") && (
        <Section>
          <p role="status" className="flex gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-verde" aria-hidden />
            {sp.registrado === "1"
              ? "Trabajador registrado. Continúa con los documentos, la foto y el código de activación."
              : "Cambios guardados."}
          </p>
        </Section>
      )}

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <Datos w={w} actor={actor} />
          <Documentos w={w} actor={actor} tipos={tipos} />
          <Capacitacion w={w} actor={actor} cursos={cursos} />
          <Historial w={w} />
        </div>
        <div>
          <Estado w={w} actor={actor} />
          <Cuenta w={w} actor={actor} />
          <PerfilPublico w={w} actor={actor} />
        </div>
      </div>
    </>
  );
}

function Datos({ w, actor }: { w: WorkerDetail; actor: AppUser }) {
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
            "Emergencia",
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
  const editable = hasPermission(actor, "worker.update") && !!p && w.status !== "RECHAZADO";
  return (
    <Section titulo="Datos del trabajador">
      <div className="tarjeta p-5">
        {!p && (
          <p className="mb-3 text-xs text-muted-foreground">
            Los datos personales solo los ve el personal con permiso para ello.
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {filas.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-semibold break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {p && <p className="mt-3 text-xs text-muted-foreground">La consulta de datos personales queda registrada.</p>}
        {editable && (
          <Link
            href={`/admin/trabajadores/${w.id}/editar`}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
          >
            <Pencil className="h-4 w-4" aria-hidden /> Editar datos y oficios
          </Link>
        )}
      </div>
    </Section>
  );
}

function Estado({ w, actor }: { w: WorkerDetail; actor: AppUser }) {
  const acciones = manualTransitions(w.status, actor.permissions);
  return (
    <Section titulo="Estado">
      <div className="space-y-4 tarjeta p-5">
        <div>
          <EstadoTrabajador status={w.status} className="text-sm" />
          <p className="mt-2 text-xs text-muted-foreground">Desde {formatearFechaHora(w.statusChangedAt)}</p>
          {w.status === "SUSPENDIDO" && w.suspendedUntil && (
            <p className="mt-1 text-xs text-muted-foreground">
              Suspensión prevista hasta {formatearFecha(w.suspendedUntil)}
            </p>
          )}
          <p className="mt-2 text-xs font-semibold">
            {isPubliclyVisible(w.status) ? "Visible en la búsqueda pública." : "No visible en la búsqueda pública."}
          </p>
        </div>
        <p className="flex gap-2 rounded-xl bg-secondary p-3 text-sm">
          <Lightbulb className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {siguientePaso[w.status]}
        </p>
        {acciones.map((to) => {
          const motivo = requiresReason(w.status, to);
          const peligrosa = to === "RECHAZADO" || to === "SUSPENDIDO" || to === "INACTIVO";
          return (
            <details
              key={to}
              className="rounded-xl border border-border p-3"
              open={acciones.length === 1 && !peligrosa}
            >
              <summary className="cursor-pointer text-sm font-bold">{accionHacia(w.status, to)}</summary>
              <ActionForm
                action={cambiarEstadoTrabajador}
                submitLabel={accionHacia(w.status, to)}
                pendingLabel="Guardando…"
                variant={peligrosa ? "danger" : "primary"}
                className="mt-3"
              >
                <input type="hidden" name="workerId" value={w.id} />
                <input type="hidden" name="to" value={to} />
                <p className="text-xs text-muted-foreground">
                  Pasará a «{ETIQUETAS_ESTADO[to]}». El cambio queda en el historial y en la auditoría.
                </p>
                <label htmlFor={`reason-${to}`} className="text-sm font-bold">
                  {motivo ? "Motivo" : "Observación (opcional)"}
                </label>
                <textarea
                  id={`reason-${to}`}
                  name="reason"
                  rows={2}
                  maxLength={500}
                  required={motivo}
                  minLength={motivo ? 5 : undefined}
                  className={campo}
                />
                {to === "SUSPENDIDO" && (
                  <>
                    <label htmlFor="suspendedUntil" className="text-sm font-bold">
                      Hasta (opcional)
                    </label>
                    <input id="suspendedUntil" name="suspendedUntil" type="date" className={campo} />
                  </>
                )}
              </ActionForm>
            </details>
          );
        })}
      </div>
    </Section>
  );
}

function Documentos({
  w,
  actor,
  tipos,
}: {
  w: WorkerDetail;
  actor: AppUser;
  tipos: Awaited<ReturnType<typeof listDocumentTypes>>;
}) {
  const puedeSubir = hasPermission(actor, "document.upload") && w.status !== "RECHAZADO";
  const puedeRevisar = hasPermission(actor, "document.review");
  const vigentes = w.documents.filter((d) => d.status !== "REEMPLAZADO");
  const obligatorios = tipos.filter((t) => t.required);
  return (
    <Section titulo="Documentos">
      <div className="space-y-4 tarjeta p-5">
        <p className="text-xs text-muted-foreground">
          {obligatorios.length
            ? `Obligatorios: ${obligatorios.map((t) => t.name).join(", ")}.`
            : "Ningún documento es obligatorio por ahora (pendiente de definición del GAD)."}{" "}
          Cada apertura de un documento queda registrada.
        </p>
        {w.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {w.documents.map((d) => (
              <li key={d.id} className={d.status === "REEMPLAZADO" ? "py-3 opacity-60" : "py-3"}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {d.typeName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.originalName ?? "archivo"} · {formatBytes(d.sizeBytes)} · cargado {formatearFecha(d.createdAt)}
                      {d.expiresAt ? ` · vence ${formatearFecha(d.expiresAt)}` : ""}
                    </p>
                    {d.reviewNote && <p className="mt-1 text-xs">Observación: {d.reviewNote}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <EstadoDocumento status={d.status} />
                    {canOpenDocument(actor, d.uploadedByMe) && (
                      <a
                        href={`/admin/trabajadores/${w.id}/documentos/${d.id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-xs font-bold text-primary underline"
                      >
                        Ver
                      </a>
                    )}
                  </div>
                </div>
                {puedeRevisar && d.status === "PENDIENTE" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActionForm action={revisarDocumento} submitLabel="Validar" pendingLabel="…" className="space-y-0">
                      <input type="hidden" name="documentId" value={d.id} />
                      <input type="hidden" name="status" value="VALIDADO" />
                    </ActionForm>
                    <details className="flex-1">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-bold">
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
                        <label htmlFor={`note-${d.id}`} className="text-sm font-bold">
                          Motivo
                        </label>
                        <textarea id={`note-${d.id}`} name="note" rows={2} maxLength={500} required className={campo} />
                      </ActionForm>
                    </details>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {puedeSubir && (
          <details className="rounded-xl border border-border p-3" open={w.documents.length === 0}>
            <summary className="cursor-pointer text-sm font-bold">Cargar documento</summary>
            <ActionForm action={subirDocumento} submitLabel="Cargar" pendingLabel="Subiendo…" className="mt-3">
              <input type="hidden" name="workerId" value={w.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="typeCode" className="text-sm font-bold">
                    Tipo
                  </label>
                  <select id="typeCode" name="typeCode" required className={campo}>
                    {tipos.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name}
                        {t.required ? " (obligatorio)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="replacesId" className="text-sm font-bold">
                    Reemplaza a <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <select id="replacesId" name="replacesId" className={campo}>
                    <option value="">Ninguno</option>
                    {vigentes.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.typeName} · {formatearFecha(d.createdAt)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="issuedAt" className="text-sm font-bold">
                    Emitido <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input id="issuedAt" name="issuedAt" type="date" className={campo} />
                </div>
                <div>
                  <label htmlFor="expiresAt" className="text-sm font-bold">
                    Vence <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input id="expiresAt" name="expiresAt" type="date" className={campo} />
                </div>
              </div>
              <div>
                <label htmlFor="file" className="text-sm font-bold">
                  Archivo (PDF, JPG, PNG o WEBP; máximo 4 MB)
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  required
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className={campo}
                />
              </div>
            </ActionForm>
          </details>
        )}
      </div>
    </Section>
  );
}

function Capacitacion({
  w,
  actor,
  cursos,
}: {
  w: WorkerDetail;
  actor: AppUser;
  cursos: Awaited<ReturnType<typeof listTrainings>>;
}) {
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
    <Section titulo="Capacitación">
      <div className="space-y-4 tarjeta p-5">
        {w.enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin inscripciones.</p>
        ) : (
          <ul className="divide-y divide-border">
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
                    <span className="rounded-lg bg-secondary px-2 py-0.5 text-xs font-bold">
                      {ETIQUETAS_INSCRIPCION[e.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Inscrito {formatearFecha(e.enrolledAt)}
                    {e.finishedAt ? ` · finalizó ${formatearFecha(e.finishedAt)}` : ""}
                    {e.score != null ? ` · nota ${e.score}` : ""}
                    {e.validUntil ? ` · vigente hasta ${formatearFecha(e.validUntil)}` : ""}
                  </p>
                  {e.resultNote && <p className="mt-1 text-xs">{e.resultNote}</p>}
                  {puedeRegistrar && abierta && (
                    <details className="mt-2 rounded-xl border border-border p-3">
                      <summary className="cursor-pointer text-sm font-bold">Registrar avance o resultado</summary>
                      <ActionForm action={actualizarInscripcion} submitLabel="Guardar resultado" className="mt-3">
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor={`status-${e.id}`} className="text-sm font-bold">
                              Resultado
                            </label>
                            <select id={`status-${e.id}`} name="status" className={campo}>
                              {resultados.map((r) => (
                                <option key={r} value={r}>
                                  {ETIQUETAS_INSCRIPCION[r]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`score-${e.id}`} className="text-sm font-bold">
                              Nota (0–100, opcional)
                            </label>
                            <input
                              id={`score-${e.id}`}
                              name="score"
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              className={campo}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`evidence-${e.id}`} className="text-sm font-bold">
                            Evidencia (documento cargado, opcional)
                          </label>
                          <select id={`evidence-${e.id}`} name="evidenceDocumentId" className={campo}>
                            <option value="">Sin evidencia</option>
                            {evidencias.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.typeName} · {formatearFecha(d.createdAt)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`note-e-${e.id}`} className="text-sm font-bold">
                            Observación (obligatoria si reprueba o abandona)
                          </label>
                          <textarea id={`note-e-${e.id}`} name="note" rows={2} maxLength={500} className={campo} />
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
          <ActionForm action={inscribirCapacitacion} submitLabel="Inscribir" pendingLabel="Inscribiendo…">
            <input type="hidden" name="workerId" value={w.id} />
            <label htmlFor="trainingId" className="text-sm font-bold">
              Inscribir en un curso
            </label>
            <select id="trainingId" name="trainingId" className={campo}>
              {inscribibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.required ? " (obligatorio)" : ""}
                </option>
              ))}
            </select>
          </ActionForm>
        )}
      </div>
    </Section>
  );
}

function Historial({ w }: { w: WorkerDetail }) {
  return (
    <Section titulo="Historial de estados">
      <ol className="space-y-3 tarjeta p-5">
        {w.history.map((h) => (
          <li key={h.id} className="border-l-2 border-primary/40 pl-3 text-sm">
            <p className="font-bold">
              {h.from ? `${ETIQUETAS_ESTADO[h.from]} → ` : ""}
              {ETIQUETAS_ESTADO[h.to]}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatearFechaHora(h.at)}
              {h.actor ? ` · ${h.actor}` : ""}
            </p>
            {h.reason && <p className="mt-0.5 text-xs">{h.reason}</p>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Cuenta({ w, actor }: { w: WorkerDetail; actor: AppUser }) {
  const puedeEmitir =
    hasPermission(actor, "worker.activation_code") && !w.linked && w.status !== "RECHAZADO" && w.status !== "INACTIVO";
  return (
    <Section titulo="Cuenta del trabajador">
      <div className="space-y-3 tarjeta p-5 text-sm">
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
    </Section>
  );
}

function PerfilPublico({ w, actor }: { w: WorkerDetail; actor: AppUser }) {
  const puedeModerar = hasPermission(actor, "worker.update") && w.status !== "RECHAZADO";
  return (
    <Section titulo="Perfil público">
      <div className="space-y-4 tarjeta p-5 text-sm">
        <div className="flex items-center gap-3">
          {w.photo.hasApproved ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen servida por el propio portal
            <img
              src={`/admin/trabajadores/${w.id}/foto?v=approved`}
              alt={`Foto publicada de ${w.displayName}`}
              className="h-20 w-20 rounded-2xl object-cover"
            />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-2xl bg-muted text-xs text-muted-foreground">
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
          <div className="space-y-2 rounded-xl border border-naranja/60 bg-naranja/10 p-3">
            <p className="font-bold">Foto propuesta por el trabajador</p>
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
          <p className="text-xs font-bold text-muted-foreground uppercase">Descripción publicada</p>
          <p className="mt-1 whitespace-pre-line">{w.publicBio ?? "—"}</p>
          {w.availabilityNote && <p className="mt-1 text-xs">Disponibilidad: {w.availabilityNote}</p>}
        </div>

        {w.proposal && (
          <div className="space-y-2 rounded-xl border border-naranja/60 bg-naranja/10 p-3">
            <p className="font-bold">Cambios propuestos ({formatearFecha(w.proposal.submittedAt)})</p>
            <p className="whitespace-pre-line">{w.proposal.bio ?? "(sin descripción)"}</p>
            {w.proposal.availabilityNote && <p className="text-xs">Disponibilidad: {w.proposal.availabilityNote}</p>}
            {puedeModerar && <Moderacion accion={revisarPerfil} workerId={w.id} etiqueta="cambios" />}
          </div>
        )}

        {puedeModerar && (
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer font-bold">
              {w.photo.hasApproved ? "Cambiar foto" : "Cargar foto"}
            </summary>
            <ActionForm
              action={subirFotoTrabajador}
              submitLabel="Guardar foto"
              pendingLabel="Subiendo…"
              className="mt-3"
            >
              <input type="hidden" name="workerId" value={w.id} />
              <label htmlFor="foto" className="text-sm font-bold">
                Foto (JPG, PNG o WEBP; máximo 4 MB)
              </label>
              <input
                id="foto"
                name="file"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                className={campo}
              />
              <p className="text-xs text-muted-foreground">
                Tomada en la atención presencial con consentimiento del trabajador: se publica sin revisión adicional.
              </p>
            </ActionForm>
          </details>
        )}
      </div>
    </Section>
  );
}

function Moderacion({
  accion,
  workerId,
  etiqueta,
}: {
  accion: typeof revisarFoto;
  workerId: string;
  etiqueta: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={accion} submitLabel={`Aprobar ${etiqueta}`} pendingLabel="…" className="space-y-0">
        <input type="hidden" name="workerId" value={workerId} />
        <input type="hidden" name="decision" value="APROBAR" />
      </ActionForm>
      <details className="flex-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-card px-4 text-sm font-bold">
          Rechazar
        </summary>
        <ActionForm action={accion} submitLabel={`Rechazar ${etiqueta}`} variant="danger" className="mt-2">
          <input type="hidden" name="workerId" value={workerId} />
          <input type="hidden" name="decision" value="RECHAZAR" />
          <label htmlFor={`motivo-${etiqueta}`} className="text-sm font-bold">
            Motivo (lo verá el trabajador)
          </label>
          <textarea id={`motivo-${etiqueta}`} name="note" rows={2} maxLength={300} required className={campo} />
        </ActionForm>
      </details>
    </div>
  );
}
