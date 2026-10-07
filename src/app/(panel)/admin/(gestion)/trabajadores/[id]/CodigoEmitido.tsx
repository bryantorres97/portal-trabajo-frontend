"use client";

import { Check, Copy, Printer } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { ActionForm } from "@/components/forms/ActionForm";
import { Logo } from "@/components/site/Logo";
import type { ActionState } from "@/lib/action-state";
import { publicEnv } from "@/lib/env.public";
import { formatearFechaHora } from "@/lib/formatos";

/**
 * Formulario para emitir el código. Vive en el cliente porque muestra el código que devuelve la
 * acción (una función como `children` no puede cruzar del servidor a un componente de cliente).
 */
export function EmitirCodigoForm({
  action,
  workerId,
  workerName,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  workerId: string;
  workerName: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Emitir código de activación" pendingLabel="Emitiendo…" variant="secondary">
      {(state) => (
        <>
          <input type="hidden" name="workerId" value={workerId} />
          {state.data?.code && (
            <CodigoEmitido code={state.data.code} expiresAt={state.data.expiresAt} workerName={workerName} />
          )}
        </>
      )}
    </ActionForm>
  );
}

/** Imprime solo el ticket: la clase en <html> oculta el resto de la página (ver globals.css). */
function imprimirTicket() {
  const html = document.documentElement;
  html.classList.add("imprimir-ticket");
  window.addEventListener("afterprint", () => html.classList.remove("imprimir-ticket"), { once: true });
  window.print();
}

/** Muestra el código de activación recién emitido (solo esta vez) con opciones para copiarlo o imprimirlo. */
export function CodigoEmitido({
  code,
  expiresAt,
  workerName,
}: {
  code: string;
  expiresAt?: string;
  workerName: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const [emitidoEl] = useState(() => new Date().toISOString());
  return (
    <div className="rounded-xl border-2 border-dashed border-primary bg-primary/5 p-4 text-center">
      <p className="text-sm font-semibold text-muted-foreground">Código de activación</p>
      <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.2em]" aria-live="polite">
        {code}
      </p>
      {expiresAt && <p className="mt-1 text-xs text-muted-foreground">Vigente hasta {formatearFechaHora(expiresAt)}</p>}
      <p className="mt-2 text-xs">
        Anótalo o imprímelo ahora: no se vuelve a mostrar. El trabajador lo ingresa en «Mi cuenta → Soy trabajador».
      </p>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopiado(true));
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold"
        >
          {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
        <button
          type="button"
          onClick={imprimirTicket}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold"
        >
          <Printer className="h-4 w-4" aria-hidden /> Imprimir ticket
        </button>
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <TicketCodigo code={code} expiresAt={expiresAt} workerName={workerName} emitidoEl={emitidoEl} />,
          document.body,
        )}
    </div>
  );
}

/** Ticket para entregar al trabajador. Solo existe en la impresión que lanza «Imprimir ticket». */
function TicketCodigo({
  code,
  expiresAt,
  workerName,
  emitidoEl,
}: {
  code: string;
  expiresAt?: string;
  workerName: string;
  emitidoEl: string;
}) {
  const sitio = new URL(publicEnv.NEXT_PUBLIC_APP_URL).host;
  return (
    <div className="ticket-impresion" aria-hidden>
      <div className="ticket-cabecera">
        <Logo className="mx-auto text-3xl text-black" />
        <p>GAD Municipalidad de Ambato</p>
      </div>
      <p className="ticket-titulo">Código de activación</p>
      <p className="ticket-nombre">{workerName}</p>
      <p className="ticket-codigo">{code}</p>
      {expiresAt && <p className="ticket-vigencia">Vigente hasta {formatearFechaHora(expiresAt)}</p>}
      <ol className="ticket-pasos">
        <li>
          Ingresa a <strong>{sitio}</strong> e inicia sesión (o crea tu cuenta).
        </li>
        <li>
          Abre <strong>Mi cuenta → Soy trabajador</strong>.
        </li>
        <li>Escribe este código y pulsa «Vincular mi cuenta».</li>
      </ol>
      <p className="ticket-pie">
        El código sirve una sola vez. No lo compartas.
        <br />
        Emitido el {formatearFechaHora(emitidoEl)}
      </p>
    </div>
  );
}
