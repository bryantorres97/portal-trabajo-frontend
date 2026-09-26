"use client";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import type { ActionState } from "@/lib/action-state";

/** Primer mensaje al trabajador (componente de cliente: el formulario muestra los errores por campo). */
export function NuevoMensajeForm({
  action,
  workerId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  workerId: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Enviar mensaje" pendingLabel="Enviando…">
      {(state) => (
        <>
          <input type="hidden" name="workerId" value={workerId} />
          <label htmlFor="body" className="text-sm font-bold">
            Tu mensaje
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={5}
            maxLength={2000}
            placeholder="Hola, necesito arreglar una fuga en el baño en Huachi Chico. ¿Podría esta semana?"
            aria-invalid={!!state.fieldErrors?.body}
            aria-describedby="body-error"
            className="mt-1 w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          <FieldError id="body-error" state={state} name="body" />
        </>
      )}
    </ActionForm>
  );
}
