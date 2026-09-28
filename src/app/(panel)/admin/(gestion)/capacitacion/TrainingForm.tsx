"use client";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import { campoCompacto } from "@/components/ui/campo";
import type { ActionState } from "@/lib/action-state";
import type { Training } from "@/server/workers/training";

type Accion = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const VACIO: Omit<Training, "id"> & { id?: string } = {
  code: "",
  name: "",
  description: null,
  provider: "INTERNO",
  validityMonths: null,
  required: false,
  active: true,
};

/** Crear o editar un curso de capacitación. */
export function TrainingForm({ action, valores, pre }: { action: Accion; valores?: Training; pre: string }) {
  const v = valores ?? VACIO;
  const id = (n: string) => `${pre}-${n}`;
  return (
    <ActionForm action={action} submitLabel={v.id ? "Guardar curso" : "Crear curso"}>
      {(state) => {
        const err = (n: string) => ({ "aria-invalid": !!state.fieldErrors?.[n], "aria-describedby": id(`${n}-error`) });
        return (
          <>
            {v.id && <input type="hidden" name="id" value={v.id} />}
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div>
                <label htmlFor={id("code")} className="text-sm font-bold">
                  Código
                </label>
                <input
                  id={id("code")}
                  name="code"
                  defaultValue={v.code}
                  required
                  maxLength={40}
                  className={campoCompacto}
                  {...err("code")}
                />
                <FieldError id={id("code-error")} state={state} name="code" />
              </div>
              <div>
                <label htmlFor={id("name")} className="text-sm font-bold">
                  Nombre
                </label>
                <input
                  id={id("name")}
                  name="name"
                  defaultValue={v.name}
                  required
                  maxLength={120}
                  className={campoCompacto}
                  {...err("name")}
                />
                <FieldError id={id("name-error")} state={state} name="name" />
              </div>
            </div>
            <div>
              <label htmlFor={id("description")} className="text-sm font-bold">
                Descripción
              </label>
              <textarea
                id={id("description")}
                name="description"
                defaultValue={v.description ?? ""}
                maxLength={500}
                rows={2}
                className={campoCompacto}
                {...err("description")}
              />
              <FieldError id={id("description-error")} state={state} name="description" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={id("provider")} className="text-sm font-bold">
                  Modalidad
                </label>
                <select id={id("provider")} name="provider" defaultValue={v.provider} className={campoCompacto}>
                  <option value="INTERNO">Dictado por el GAD</option>
                  <option value="EXTERNO">Externo (con evidencia)</option>
                </select>
              </div>
              <div>
                <label htmlFor={id("validityMonths")} className="text-sm font-bold">
                  Vigencia en meses <span className="font-normal text-muted-foreground">(vacío = sin vencimiento)</span>
                </label>
                <input
                  id={id("validityMonths")}
                  name="validityMonths"
                  type="number"
                  min={1}
                  max={120}
                  defaultValue={v.validityMonths ?? ""}
                  className={campoCompacto}
                  {...err("validityMonths")}
                />
                <FieldError id={id("validityMonths-error")} state={state} name="validityMonths" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="required" defaultChecked={v.required} className="h-5 w-5 accent-primary" />
                Obligatorio para habilitar
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="active" defaultChecked={v.active} className="h-5 w-5 accent-primary" />
                Activo
              </label>
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
