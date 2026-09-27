"use client";

import { Eye, FileText, Loader2, Lock, ShieldAlert } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import { boton } from "@/components/ui/boton";
import { ayuda, campoCompacto, etiqueta } from "@/components/ui/campo";
import { formatearFecha, formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { hoyEcuador } from "@/server/domain/contracts/schemas";
import { formatearPrecio } from "@/server/domain/contracts/state-machine";
import {
  esTemporal,
  ETIQUETAS_ACCION,
  ETIQUETAS_RESOLUCION,
  RESOLUCIONES,
  type AccionModeracion,
  type ReportStatus,
} from "@/server/domain/reports/state-machine";
import type { EvidenceView } from "@/server/reports/admin";

import { gestionarDenuncia, levantarSancion, resolverDisputa, sancionar, verEvidencia } from "../actions";

const area = `${campoCompacto} min-h-20 resize-y`;

/** Operación con nota (y resultado al resolver) sobre la denuncia. */
export function OperacionDenuncia({ reportId, status }: { reportId: string; status: ReportStatus }) {
  const ops: { op: string; etiqueta: string }[] = [
    ...(status === "ABIERTA" || status === "EN_ESPERA_DE_INFORMACION" || status === "ESCALADA"
      ? [{ op: "REVIEW", etiqueta: "Pasar a revisión" }]
      : []),
    ...(status === "EN_REVISION" ? [{ op: "REQUEST_INFO", etiqueta: "Pedir información al denunciante" }] : []),
    ...(status === "EN_REVISION" ? [{ op: "ESCALATE", etiqueta: "Escalar" }] : []),
    { op: "RESOLVE", etiqueta: "Resolver" },
    { op: "DISCARD", etiqueta: "Cerrar sin acciones" },
    { op: "NOTE", etiqueta: "Nota interna" },
  ];
  const [op, setOp] = useState(ops[0].op);
  const ayudaNota: Record<string, string> = {
    REVIEW: "Opcional.",
    REQUEST_INFO: "La verá el denunciante: indica qué necesitas.",
    ESCALATE: "Explica por qué escalas el caso (interna).",
    RESOLVE: "Justificación de la resolución (interna). El denunciante solo recibe el resultado genérico.",
    DISCARD: "Por qué se cierra sin acciones (interna).",
    NOTE: "Solo la ve el personal del GAD.",
  };
  return (
    <ActionForm action={gestionarDenuncia} submitLabel="Guardar" tamano="sm" className="space-y-3">
      {(state) => (
        <>
          <input type="hidden" name="reportId" value={reportId} />
          <div>
            <label htmlFor="op" className={etiqueta}>
              Acción
            </label>
            <select id="op" name="op" value={op} onChange={(e) => setOp(e.target.value)} className={campoCompacto}>
              {ops.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </div>
          {op === "RESOLVE" && (
            <div>
              <label htmlFor="resolution" className={etiqueta}>
                Resultado
              </label>
              <select id="resolution" name="resolution" className={campoCompacto} defaultValue="MEDIDAS_APLICADAS">
                {RESOLUCIONES.map((r) => (
                  <option key={r} value={r}>
                    {ETIQUETAS_RESOLUCION[r]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="note" className={etiqueta}>
              Nota
            </label>
            <textarea id="note" name="note" rows={3} maxLength={1000} aria-describedby="note-ayuda" className={area} />
            <p id="note-ayuda" className={ayuda}>
              {ayudaNota[op]}
            </p>
            <FieldError id="note-error" state={state} name="note" />
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function BotonOperacion({
  reportId,
  op,
  etiqueta: texto,
  variante = "secondary",
  extra,
}: {
  reportId: string;
  op: string;
  etiqueta: string;
  variante?: "primary" | "secondary";
  extra?: Record<string, string>;
}) {
  return (
    <ActionForm action={gestionarDenuncia} submitLabel={texto} variant={variante} tamano="sm" className="space-y-2">
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="op" value={op} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </ActionForm>
  );
}

export function PrioridadForm({ reportId, prioridad }: { reportId: string; prioridad: 1 | 2 | 3 }) {
  return (
    <ActionForm
      action={gestionarDenuncia}
      submitLabel="Cambiar prioridad"
      tamano="sm"
      variant="secondary"
      className="space-y-2"
    >
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="op" value="PRIORITY" />
      <label htmlFor="priority" className={etiqueta}>
        Prioridad
      </label>
      <select id="priority" name="priority" defaultValue={String(prioridad)} className={campoCompacto}>
        <option value="1">Alta</option>
        <option value="2">Media</option>
        <option value="3">Baja</option>
      </select>
    </ActionForm>
  );
}

/** Acciones de moderación posibles para la denuncia (filtradas por permisos y objetivo en el servidor). */
export function FormularioSancion({ reportId, acciones }: { reportId: string; acciones: AccionModeracion[] }) {
  const [accion, setAccion] = useState<AccionModeracion>(acciones[0]);
  return (
    <ActionForm action={sancionar} submitLabel="Aplicar acción" variant="danger" tamano="sm" className="space-y-3">
      {(state) => (
        <>
          <input type="hidden" name="reportId" value={reportId} />
          <div>
            <label htmlFor="action" className={etiqueta}>
              Acción
            </label>
            <select
              id="action"
              name="action"
              value={accion}
              onChange={(e) => setAccion(e.target.value as AccionModeracion)}
              className={campoCompacto}
            >
              {acciones.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETAS_ACCION[a]}
                </option>
              ))}
            </select>
          </div>
          {esTemporal(accion) && (
            <div>
              <label htmlFor="endsOn" className={etiqueta}>
                Hasta (inclusive)
              </label>
              <input id="endsOn" name="endsOn" type="date" min={hoyEcuador()} required className={campoCompacto} />
              <FieldError id="endsOn-error" state={state} name="endsOn" />
            </div>
          )}
          <div>
            <label htmlFor="reason" className={etiqueta}>
              Motivo
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              maxLength={1000}
              aria-describedby="reason-ayuda"
              className={area}
            />
            <p id="reason-ayuda" className={ayuda}>
              {accion === "ADVERTENCIA"
                ? "La persona recibirá este texto como advertencia."
                : "Queda en la auditoría y en el historial de la denuncia."}
            </p>
            <FieldError id="reason-error" state={state} name="reason" />
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function LevantarSancion({ actionId }: { actionId: string }) {
  return (
    <ActionForm
      action={levantarSancion}
      submitLabel="Revocar"
      variant="secondary"
      tamano="sm"
      className="mt-2 space-y-2"
    >
      {(state) => (
        <>
          <input type="hidden" name="actionId" value={actionId} />
          <label htmlFor={`lift-${actionId}`} className="sr-only">
            Motivo de la revocación
          </label>
          <input
            id={`lift-${actionId}`}
            name="reason"
            maxLength={500}
            placeholder="Motivo de la revocación"
            className={campoCompacto}
          />
          <FieldError id={`lift-${actionId}-error`} state={state} name="reason" />
        </>
      )}
    </ActionForm>
  );
}

export function ResolverDisputa({ reportId, contractId }: { reportId: string; contractId: string }) {
  return (
    <ActionForm action={resolverDisputa} submitLabel="Resolver disputa" tamano="sm" className="space-y-3">
      {(state) => (
        <>
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="contractId" value={contractId} />
          <fieldset className="space-y-2">
            <legend className={etiqueta}>La contratación queda</legend>
            {[
              ["FINALIZADA", "Finalizada (el trabajo se hizo)"],
              ["CANCELADA", "Cancelada (no se hizo o no procede)"],
            ].map(([v, t], i) => (
              <label key={v} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="outcome"
                  value={v}
                  defaultChecked={i === 0}
                  className="h-4 w-4 accent-primary"
                />
                {t}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="dispute-note" className={etiqueta}>
              Justificación
            </label>
            <textarea id="dispute-note" name="note" rows={3} maxLength={1000} className={area} />
            <FieldError id="dispute-note-error" state={state} name="note" />
          </div>
        </>
      )}
    </ActionForm>
  );
}

/**
 * RN-09: la conversación y la evidencia se ven solo tras escribir una justificación; cada acceso queda
 * registrado. El contenido vive en la memoria de la página (no se guarda).
 */
export function PanelEvidencia({
  reportId,
  puede,
  hayConversacion,
  hayContrato,
  archivos,
}: {
  reportId: string;
  puede: boolean;
  hayConversacion: boolean;
  hayContrato: boolean;
  archivos: number;
}) {
  const [datos, setDatos] = useState<EvidenceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function acceder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const justificacion = String(new FormData(e.currentTarget).get("justification") ?? "");
    iniciar(async () => {
      const r = await verEvidencia(reportId, justificacion);
      if (r.ok) {
        setDatos(r.data);
        setError(null);
      } else setError(r.message);
    });
  }

  const que = [
    hayConversacion && "la conversación",
    hayContrato && "la contratación",
    archivos > 0 && `${archivos} aporte(s)`,
  ]
    .filter(Boolean)
    .join(", ");

  if (!datos) {
    return (
      <section aria-labelledby="evidencia" className="tarjeta p-5">
        <h2 id="evidencia" className="flex items-center gap-2 text-lg font-extrabold">
          <Lock className="h-5 w-5 text-primary" aria-hidden /> Evidencia confidencial
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {que ? `Incluye ${que}.` : "No hay conversación ni archivos asociados."} Por privacidad (RN-09), el acceso
          exige una justificación y queda registrado con tu nombre.
        </p>
        {puede ? (
          <form onSubmit={acceder} className="mt-4 space-y-3" noValidate>
            <label htmlFor="justification" className={etiqueta}>
              Justificación del acceso
            </label>
            <textarea
              id="justification"
              name="justification"
              rows={3}
              maxLength={1000}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "justification-error" : undefined}
              placeholder="Ej.: verificar el intento de cobro fuera de la plataforma denunciado"
              className={area}
            />
            {error && (
              <p id="justification-error" role="alert" className="text-sm font-semibold text-destructive">
                {error}
              </p>
            )}
            <button type="submit" disabled={pendiente} className={boton({ tamano: "sm" })}>
              {pendiente ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
              Acceder a la evidencia
            </button>
          </form>
        ) : (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden /> Tu rol no tiene acceso a la evidencia.
          </p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="evidencia" className="tarjeta p-5">
      <h2 id="evidencia" className="flex items-center gap-2 text-lg font-extrabold">
        <Eye className="h-5 w-5 text-primary" aria-hidden /> Evidencia (acceso registrado)
      </h2>

      {datos.conversation && (
        <div className="mt-4">
          <h3 className="text-sm font-bold">
            Conversación: {datos.conversation.clientName ?? "Cliente"} (cliente) · {datos.conversation.workerName}{" "}
            (trabajador)
          </h3>
          <ol className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto rounded-xl bg-secondary/60 p-3">
            {datos.conversation.messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "rounded-xl bg-card p-2.5 text-sm",
                  m.id === datos.focusMessageId && "ring-2 ring-destructive",
                  m.kind === "SYSTEM" && "bg-transparent text-muted-foreground italic",
                )}
              >
                <p className="text-xs font-bold text-muted-foreground">
                  {m.senderRole === "CLIENTE" ? "Cliente" : m.senderRole === "TRABAJADOR" ? "Trabajador" : "Sistema"} ·{" "}
                  {formatearFechaHora(m.createdAt)}
                  {m.hidden ? " · oculto por moderación" : ""}
                  {m.id === datos.focusMessageId ? " · mensaje denunciado" : ""}
                </p>
                <p className="mt-0.5 break-words whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {datos.contract && (
        <div className="mt-5">
          <h3 className="text-sm font-bold">Contratación ({datos.contract.status})</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {datos.contract.versions.map((v) => (
              <li
                key={v.version}
                className={cn("rounded-xl border border-border p-3", v.agreed && "border-verde-fuerte/60")}
              >
                <p className="font-bold">
                  Versión {v.version} · propuesta por {v.proposerRole === "CLIENTE" ? "el cliente" : "el trabajador"}
                  {v.agreed ? " · acordada" : ""}
                </p>
                <p className="mt-1">{v.description}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatearPrecio(Number(v.priceAmount), v.priceUnit)} · desde {formatearFecha(v.scheduledStart)}
                </p>
                {v.conditions && <p className="mt-1 text-muted-foreground">{v.conditions}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {datos.evidence.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-bold">Aportes del denunciante</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {datos.evidence.map((x) => (
              <li key={x.id} className="flex gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {x.kind === "FILE" ? (
                  <a
                    href={`/admin/denuncias/${reportId}/evidencia/${x.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-primary underline-offset-4 hover:underline"
                  >
                    {x.name ?? "Archivo"}
                  </a>
                ) : (
                  <span className="break-words whitespace-pre-wrap">{x.note}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{formatearFechaHora(x.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
