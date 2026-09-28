"use client";

import { useRouter } from "next/navigation";
import { Loader2, Lock, Pencil, Star } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SelectorEstrellas } from "@/components/reviews/SelectorEstrellas";
import { Estrellas } from "@/components/site/Estrellas";
import { boton } from "@/components/ui/boton";
import { campo, etiqueta } from "@/components/ui/campo";
import { formatearFecha, formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { countWords, MAX_CARACTERES_COMENTARIO, MAX_PALABRAS, reviewSchema } from "@/server/domain/reviews/schemas";
import type { ContractReview, ContractReviews } from "@/server/reviews/reviews";

/**
 * Calificación de una contratación finalizada: formulario (crear o editar dentro de 7 días), la
 * calificación propia y la recibida si se puede ver (RN-20: la del trabajador al cliente no la ve el cliente).
 */
export function SeccionCalificacion({
  contractId,
  miRol,
  otra,
  r,
}: {
  contractId: string;
  miRol: "CLIENTE" | "TRABAJADOR";
  otra: string;
  r: ContractReviews;
}) {
  const [editando, setEditando] = useState(false);
  const mostrarFormulario = (r.canCreate && !r.mine) || editando;
  const aviso =
    miRol === "CLIENTE"
      ? `Se publicará en el perfil de ${otra} con tu nombre abreviado.`
      : `Solo la verán otros trabajadores y el personal del GAD; ${otra} no la verá.`;

  return (
    <section aria-labelledby="calificacion" className="panel p-5 sm:p-6">
      <h2 id="calificacion" className="flex items-center gap-2 text-xl font-extrabold">
        <Star className="h-5 w-5 fill-amarillo text-amarillo" aria-hidden />
        {miRol === "CLIENTE" ? `Califica a ${otra}` : `Califica a ${otra} como cliente`}
      </h2>

      {mostrarFormulario ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {aviso}
            {!r.mine && r.windowEndsAt && ` Puedes calificar hasta el ${formatearFecha(r.windowEndsAt)}.`}
          </p>
          <FormularioCalificacion
            contractId={contractId}
            inicial={editando ? r.mine : null}
            onCancelar={editando ? () => setEditando(false) : undefined}
            onListo={() => setEditando(false)}
          />
        </>
      ) : r.mine ? (
        <div className="mt-3">
          <Resena r={r.mine} titulo="Tu calificación" />
          {r.mine.canEdit ? (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className={cn(boton({ variante: "secundario", tamano: "sm" }), "mt-3")}
            >
              <Pencil aria-hidden /> Editar (hasta el {formatearFechaHora(r.mine.editableUntil)})
            </button>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" aria-hidden />
              {r.mine.status === "OCULTA"
                ? "El GAD ocultó esta calificación por moderación."
                : "Ya no se puede editar (pasaron 7 días)."}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">Venció el plazo para calificar esta contratación.</p>
      )}

      {r.theirs && (
        <div className="mt-5 border-t border-border pt-5">
          <Resena r={r.theirs} titulo={`Lo que ${otra} opinó de ti`} />
        </div>
      )}
    </section>
  );
}

function Resena({ r, titulo }: { r: ContractReview; titulo: string }) {
  return (
    <figure>
      <figcaption className="flex flex-wrap items-center gap-2 text-sm font-bold">
        {titulo}
        <Estrellas valor={r.rating} />
        <span className="font-normal text-muted-foreground">
          {formatearFecha(r.createdAt)}
          {r.editedAt ? " · editada" : ""}
        </span>
      </figcaption>
      {r.comment && <blockquote className="mt-2 break-words whitespace-pre-wrap">{r.comment}</blockquote>}
    </figure>
  );
}

function FormularioCalificacion({
  contractId,
  inicial,
  onCancelar,
  onListo,
}: {
  contractId: string;
  inicial: ContractReview | null;
  onCancelar?: () => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(inicial?.rating ?? 0);
  const [comentario, setComentario] = useState(inicial?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const palabras = countWords(comentario);
  const excedido = palabras > MAX_PALABRAS;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = reviewSchema.safeParse({ rating, comment: comentario });
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? "Revisa la calificación.");
      return;
    }
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/v1/contracts/${contractId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r.data),
    });
    setEnviando(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string };
      setError(err.detail ?? "No pudimos guardar la calificación. Inténtalo de nuevo.");
      return;
    }
    onListo();
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="mt-4 space-y-4">
      <SelectorEstrellas valor={rating} onChange={setRating} invalido={!!error && rating === 0} />
      <div>
        <label htmlFor="comentario" className={etiqueta}>
          Comentario <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id="comentario"
          name="comment"
          rows={4}
          maxLength={MAX_CARACTERES_COMENTARIO}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          aria-describedby="comentario-contador"
          aria-invalid={excedido || undefined}
          placeholder="¿Cómo fue el trabajo? ¿Cumplió lo acordado?"
          className={cn(campo, "min-h-28 resize-y")}
        />
        <p
          id="comentario-contador"
          aria-live="polite"
          className={cn(
            "mt-1.5 text-right text-sm tabular-nums",
            excedido ? "font-bold text-destructive" : "text-muted-foreground",
          )}
        >
          {palabras} de {MAX_PALABRAS} palabras
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={enviando || excedido} className={boton()}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          {inicial ? "Guardar cambios" : "Enviar calificación"}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className={boton({ variante: "secundario" })}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
