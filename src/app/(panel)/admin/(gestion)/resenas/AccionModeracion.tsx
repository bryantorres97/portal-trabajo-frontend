"use client";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import { campoCompacto, etiqueta } from "@/components/ui/campo";

import { moderarResena } from "./actions";

/** Ocultar (o restaurar) una reseña con el motivo, que queda en la auditoría. */
export function AccionModeracion({ reviewId, oculta }: { reviewId: string; oculta: boolean }) {
  const campoId = `motivo-${reviewId}`;
  return (
    <ActionForm
      action={moderarResena}
      submitLabel={oculta ? "Restaurar reseña" : "Ocultar reseña"}
      pendingLabel={oculta ? "Restaurando…" : "Ocultando…"}
      variant={oculta ? "secondary" : "danger"}
      tamano="sm"
      className="space-y-2"
    >
      {(state) => (
        <>
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="hidden" value={oculta ? "false" : "true"} />
          <label htmlFor={campoId} className={etiqueta}>
            Motivo {oculta ? "de la restauración" : "para ocultarla"}
          </label>
          <textarea
            id={campoId}
            name="reason"
            rows={2}
            maxLength={500}
            required
            aria-describedby={`${campoId}-error`}
            className={`${campoCompacto} min-h-16 resize-y`}
          />
          <FieldError id={`${campoId}-error`} state={state} name="reason" />
        </>
      )}
    </ActionForm>
  );
}
