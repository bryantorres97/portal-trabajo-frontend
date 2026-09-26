"use client";

import { useRef } from "react";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import type { ActionState } from "@/lib/action-state";

const IDEAS = [
  "Hola, ¿tiene disponibilidad esta semana?",
  "Necesito un presupuesto aproximado.",
  "¿Puede venir a ver el trabajo antes?",
];

/** Primer mensaje al trabajador (componente de cliente: el formulario muestra los errores por campo). */
export function NuevoMensajeForm({
  action,
  workerId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  workerId: string;
}) {
  const cajaRef = useRef<HTMLTextAreaElement>(null);

  function usarIdea(idea: string) {
    const caja = cajaRef.current;
    if (!caja) return;
    caja.value = caja.value.trim() ? `${caja.value.trim()} ${idea}` : idea;
    caja.focus();
    caja.setSelectionRange(caja.value.length, caja.value.length);
  }

  return (
    <ActionForm action={action} submitLabel="Enviar mensaje" pendingLabel="Enviando…">
      {(state) => (
        <>
          <input type="hidden" name="workerId" value={workerId} />
          <label htmlFor="body" className="text-base font-bold">
            ¿Qué necesitas?
          </label>
          <p id="body-ayuda" className="text-sm text-muted-foreground">
            Cuenta el trabajo, la zona y cuándo lo necesitas. Así te puede responder mejor.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ideas para empezar">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => usarIdea(idea)}
                className="min-h-10 rounded-full border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                {idea}
              </button>
            ))}
          </div>
          <textarea
            id="body"
            ref={cajaRef}
            name="body"
            required
            rows={5}
            maxLength={2000}
            placeholder="Ej.: Hola, tengo una fuga en el baño en Huachi Chico. ¿Podría venir el jueves?"
            aria-invalid={!!state.fieldErrors?.body}
            aria-describedby="body-ayuda body-error"
            className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-base leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 aria-[invalid=true]:border-destructive"
          />
          <FieldError id="body-error" state={state} name="body" />
        </>
      )}
    </ActionForm>
  );
}
