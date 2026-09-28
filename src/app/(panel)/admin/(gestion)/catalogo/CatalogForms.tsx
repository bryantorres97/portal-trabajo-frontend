"use client";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import { campoCompacto } from "@/components/ui/campo";
import type { ActionState } from "@/lib/action-state";

type Accion = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const COLORES = [
  ["verde", "Verde"],
  ["azul", "Azul"],
  ["magenta", "Magenta"],
  ["amarillo", "Amarillo"],
  ["naranja", "Naranja"],
] as const;

const UNIDADES = [
  ["JORNAL", "Por jornal"],
  ["JORNADA", "Por jornada"],
  ["HORA", "Por hora"],
  ["OBRA", "Por obra"],
  ["SERVICIO", "Por servicio"],
] as const;

type Base = {
  id?: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  active: boolean;
};

function Campos({ state, v, pre }: { state: ActionState; v: Base; pre: string }) {
  const id = (n: string) => `${pre}-${n}`;
  const err = (n: string) => ({ "aria-invalid": !!state.fieldErrors?.[n], "aria-describedby": id(`${n}-error`) });
  return (
    <>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id("name")} className="text-sm font-bold">
            Nombre
          </label>
          <input
            id={id("name")}
            name="name"
            defaultValue={v.name}
            required
            maxLength={80}
            className={campoCompacto}
            {...err("name")}
          />
          <FieldError id={id("name-error")} state={state} name="name" />
        </div>
        <div>
          <label htmlFor={id("slug")} className="text-sm font-bold">
            Identificador en la URL
          </label>
          <input
            id={id("slug")}
            name="slug"
            defaultValue={v.slug}
            required
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className={campoCompacto}
            {...err("slug")}
          />
          <FieldError id={id("slug-error")} state={state} name="slug" />
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
          maxLength={300}
          rows={2}
          className={campoCompacto}
          {...err("description")}
        />
        <FieldError id={id("description-error")} state={state} name="description" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={id("color")} className="text-sm font-bold">
            Color
          </label>
          <select id={id("color")} name="color" defaultValue={v.color} className={campoCompacto}>
            {COLORES.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id("sortOrder")} className="text-sm font-bold">
            Orden
          </label>
          <input
            id={id("sortOrder")}
            name="sortOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={v.sortOrder}
            className={campoCompacto}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
          <input type="checkbox" name="active" defaultChecked={v.active} className="h-5 w-5 accent-primary" />
          Visible en el portal
        </label>
      </div>
    </>
  );
}

export function CategoryForm({ action, valores, pre }: { action: Accion; valores?: Base; pre: string }) {
  const v: Base = valores ?? { slug: "", name: "", description: null, color: "azul", sortOrder: 0, active: true };
  return (
    <ActionForm action={action} submitLabel={v.id ? "Guardar categoría" : "Crear categoría"}>
      {(state) => <Campos state={state} v={v} pre={pre} />}
    </ActionForm>
  );
}

type ServicioValores = Base & {
  categoryId: string;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string;
};

export function ServiceForm({
  action,
  valores,
  categorias,
  pre,
}: {
  action: Accion;
  valores?: ServicioValores;
  categorias: { id: string; name: string }[];
  pre: string;
}) {
  const v: ServicioValores = valores ?? {
    slug: "",
    name: "",
    description: null,
    color: "azul",
    sortOrder: 0,
    active: true,
    categoryId: categorias[0]?.id ?? "",
    priceMin: null,
    priceMax: null,
    priceUnit: "JORNAL",
  };
  const id = (n: string) => `${pre}-${n}`;
  return (
    <ActionForm action={action} submitLabel={v.id ? "Guardar oficio" : "Crear oficio"}>
      {(state) => (
        <>
          <div>
            <label htmlFor={id("categoryId")} className="text-sm font-bold">
              Categoría
            </label>
            <select id={id("categoryId")} name="categoryId" defaultValue={v.categoryId} className={campoCompacto}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Campos state={state} v={v} pre={pre} />
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="mb-1 text-sm font-bold">Tarifa referencial (USD, opcional)</legend>
            <div>
              <label htmlFor={id("priceMin")} className="text-xs font-semibold">
                Mínimo
              </label>
              <input
                id={id("priceMin")}
                name="priceMin"
                type="number"
                min={0}
                step="0.01"
                defaultValue={v.priceMin ?? ""}
                className={campoCompacto}
              />
            </div>
            <div>
              <label htmlFor={id("priceMax")} className="text-xs font-semibold">
                Máximo
              </label>
              <input
                id={id("priceMax")}
                name="priceMax"
                type="number"
                min={0}
                step="0.01"
                defaultValue={v.priceMax ?? ""}
                aria-invalid={!!state.fieldErrors?.priceMax}
                aria-describedby={id("priceMax-error")}
                className={campoCompacto}
              />
              <FieldError id={id("priceMax-error")} state={state} name="priceMax" />
            </div>
            <div>
              <label htmlFor={id("priceUnit")} className="text-xs font-semibold">
                Unidad
              </label>
              <select id={id("priceUnit")} name="priceUnit" defaultValue={v.priceUnit} className={campoCompacto}>
                {UNIDADES.map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        </>
      )}
    </ActionForm>
  );
}
