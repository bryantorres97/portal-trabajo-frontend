"use client";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";

import { eliminarCuenta } from "../actions";

/** Confirmación final: casilla obligatoria y botón de peligro. */
export function FormularioEliminar() {
  return (
    <ActionForm
      action={eliminarCuenta}
      submitLabel="Eliminar mi cuenta definitivamente"
      pendingLabel="Eliminando…"
      variant="danger"
      silentSuccess
    >
      {(state) => (
        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="entiendo"
              required
              aria-describedby="error-entiendo"
              className="mt-0.5 h-6 w-6 shrink-0 accent-destructive"
            />
            <span>Entiendo que mi cuenta se elimina de inmediato y que no se puede deshacer.</span>
          </label>
          <FieldError id="error-entiendo" state={state} name="entiendo" />
        </div>
      )}
    </ActionForm>
  );
}
