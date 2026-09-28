"use client";

import { Check, Copy, Printer } from "lucide-react";
import { useState } from "react";

import { ActionForm } from "@/components/forms/ActionForm";
import type { ActionState } from "@/lib/action-state";
import { formatearFechaHora } from "@/lib/formatos";

/**
 * Formulario para emitir el código. Vive en el cliente porque muestra el código que devuelve la
 * acción (una función como `children` no puede cruzar del servidor a un componente de cliente).
 */
export function EmitirCodigoForm({
  action,
  workerId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  workerId: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Emitir código de activación" pendingLabel="Emitiendo…" variant="secondary">
      {(state) => (
        <>
          <input type="hidden" name="workerId" value={workerId} />
          {state.data?.code && <CodigoEmitido code={state.data.code} expiresAt={state.data.expiresAt} />}
        </>
      )}
    </ActionForm>
  );
}

/** Muestra el código de activación recién emitido (solo esta vez) con opciones para copiarlo o imprimirlo. */
export function CodigoEmitido({ code, expiresAt }: { code: string; expiresAt?: string }) {
  const [copiado, setCopiado] = useState(false);
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
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold"
        >
          <Printer className="h-4 w-4" aria-hidden /> Imprimir
        </button>
      </div>
    </div>
  );
}
