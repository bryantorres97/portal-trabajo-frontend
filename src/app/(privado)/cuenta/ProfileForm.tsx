"use client";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import { campo } from "@/components/ui/campo";
import type { ActionState } from "@/lib/action-state";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: { fullName: string; phone: string; sector: string };
};

export function ProfileForm({ action, initial }: Props) {
  return (
    <ActionForm action={action} submitLabel="Guardar mis datos" pendingLabel="Guardando…">
      {(state) => (
        <>
          <div>
            <label htmlFor="fullName" className="text-sm font-bold">
              Nombre completo
            </label>
            <input
              id="fullName"
              name="fullName"
              defaultValue={initial.fullName}
              autoComplete="name"
              required
              maxLength={120}
              aria-invalid={!!state.fieldErrors?.fullName}
              aria-describedby="fullName-error"
              className={campo}
            />
            <FieldError id="fullName-error" state={state} name="fullName" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className="text-sm font-bold">
                Celular <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={initial.phone}
                inputMode="tel"
                autoComplete="tel"
                placeholder="09XXXXXXXX"
                aria-invalid={!!state.fieldErrors?.phone}
                aria-describedby="phone-help phone-error"
                className={campo}
              />
              <p id="phone-help" className="mt-1 text-xs text-muted-foreground">
                Solo lo verán los trabajadores con quienes acuerdes un servicio.
              </p>
              <FieldError id="phone-error" state={state} name="phone" />
            </div>
            <div>
              <label htmlFor="sector" className="text-sm font-bold">
                Sector o barrio <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="sector"
                name="sector"
                defaultValue={initial.sector}
                maxLength={80}
                aria-invalid={!!state.fieldErrors?.sector}
                aria-describedby="sector-error"
                className={campo}
              />
              <FieldError id="sector-error" state={state} name="sector" />
            </div>
          </div>
        </>
      )}
    </ActionForm>
  );
}
