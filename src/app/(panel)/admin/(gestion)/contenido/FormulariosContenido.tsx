"use client";

import { ActionForm, FieldError } from "@/components/forms/ActionForm";
import { ayuda, campoCompacto, etiqueta } from "@/components/ui/campo";
import { ETIQUETAS_AUDIENCIA } from "@/server/domain/panel/schemas";

import {
  descartarBorradorLegal,
  eliminarPregunta,
  guardarBorradorLegal,
  guardarPregunta,
  publicarLegal,
} from "./actions";

type Pregunta = {
  id: string;
  audience: "GENERAL" | "CLIENTES" | "TRABAJADORES";
  question: string;
  answerMd: string;
  sortOrder: number;
  published: boolean;
};

export function FormularioPregunta({ p }: { p?: Pregunta }) {
  const id = p?.id ?? "nueva";
  return (
    <ActionForm
      action={guardarPregunta}
      submitLabel={p ? "Guardar cambios" : "Crear pregunta"}
      tamano="sm"
      className="space-y-3"
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={p?.id ?? ""} />
          <div>
            <label htmlFor={`q-${id}`} className={etiqueta}>
              Pregunta
            </label>
            <input
              id={`q-${id}`}
              name="question"
              defaultValue={p?.question}
              maxLength={200}
              className={campoCompacto}
            />
            <FieldError id={`q-${id}-e`} state={state} name="question" />
          </div>
          <div>
            <label htmlFor={`a-${id}`} className={etiqueta}>
              Respuesta
            </label>
            <textarea
              id={`a-${id}`}
              name="answerMd"
              defaultValue={p?.answerMd}
              rows={4}
              maxLength={4000}
              aria-describedby={`a-${id}-ayuda`}
              className={`${campoCompacto} min-h-24 resize-y`}
            />
            <p id={`a-${id}-ayuda`} className={ayuda}>
              Admite **negritas** y listas.
            </p>
            <FieldError id={`a-${id}-e`} state={state} name="answerMd" />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`au-${id}`} className={etiqueta}>
                Para
              </label>
              <select id={`au-${id}`} name="audience" defaultValue={p?.audience ?? "GENERAL"} className={campoCompacto}>
                {Object.entries(ETIQUETAS_AUDIENCIA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label htmlFor={`o-${id}`} className={etiqueta}>
                Orden
              </label>
              <input
                id={`o-${id}`}
                name="sortOrder"
                type="number"
                min={0}
                max={999}
                defaultValue={p?.sortOrder ?? 0}
                className={campoCompacto}
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                name="published"
                defaultChecked={p?.published ?? false}
                className="h-5 w-5 accent-primary"
              />
              Publicada
            </label>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function EliminarPregunta({ id }: { id: string }) {
  return (
    <ActionForm action={eliminarPregunta} submitLabel="Eliminar" variant="danger" tamano="sm" className="mt-2">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}

export function FormularioBorradorLegal({
  code,
  titulo,
  contenido,
}: {
  code: "TERMINOS" | "PRIVACIDAD";
  titulo: string;
  contenido: string;
}) {
  return (
    <ActionForm
      action={guardarBorradorLegal}
      submitLabel="Guardar borrador"
      tamano="sm"
      variant="secondary"
      className="space-y-3"
    >
      {(state) => (
        <>
          <input type="hidden" name="code" value={code} />
          <div>
            <label htmlFor={`t-${code}`} className={etiqueta}>
              Título
            </label>
            <input id={`t-${code}`} name="title" defaultValue={titulo} maxLength={200} className={campoCompacto} />
            <FieldError id={`t-${code}-e`} state={state} name="title" />
          </div>
          <div>
            <label htmlFor={`c-${code}`} className={etiqueta}>
              Texto (Markdown)
            </label>
            <textarea
              id={`c-${code}`}
              name="contentMd"
              defaultValue={contenido}
              rows={14}
              className={`${campoCompacto} min-h-72 resize-y font-mono text-xs`}
            />
            <FieldError id={`c-${code}-e`} state={state} name="contentMd" />
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function PublicarLegal({ code, version }: { code: string; version: number }) {
  return (
    <ActionForm action={publicarLegal} submitLabel={`Publicar la versión ${version}`} tamano="sm" className="space-y-3">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="version" value={version} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmo" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
        Entiendo que, al publicarla, todas las personas deberán aceptar la nueva versión antes de seguir usando el
        portal, y que ya no podrá modificarse.
      </label>
    </ActionForm>
  );
}

export function DescartarBorrador({ code }: { code: string }) {
  return (
    <ActionForm action={descartarBorradorLegal} submitLabel="Descartar borrador" variant="secondary" tamano="sm">
      <input type="hidden" name="code" value={code} />
    </ActionForm>
  );
}
