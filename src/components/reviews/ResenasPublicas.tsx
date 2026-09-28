"use client";

import { Flag, Loader2, MessageSquareQuote } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Estrellas } from "@/components/site/Estrellas";
import { boton } from "@/components/ui/boton";
import { campo, etiqueta } from "@/components/ui/campo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatearFecha } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { PublicReview } from "@/server/reviews/reviews";

/** Reseñas públicas del perfil: primera página del servidor, «Ver más» y denuncia (requiere sesión). */
export function ResenasPublicas({
  workerId,
  inicial,
  total,
  hayMasInicial,
  motivos,
}: {
  workerId: string;
  inicial: PublicReview[];
  total: number;
  hayMasInicial: boolean;
  motivos: { code: string; label: string }[];
}) {
  const [items, setItems] = useState(inicial);
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [cargando, setCargando] = useState(false);
  const [denunciando, setDenunciando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string; login?: boolean } | null>(null);

  async function verMas() {
    setCargando(true);
    const res = await fetch(`/api/v1/workers/${workerId}/reviews?page=${pagina + 1}`);
    if (res.ok) {
      const d = (await res.json()) as { items: PublicReview[]; hasMore: boolean };
      setItems((prev) => [...prev, ...d.items.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHayMas(d.hasMore);
      setPagina((p) => p + 1);
    }
    setCargando(false);
  }

  if (total === 0) {
    return (
      <p className="flex items-center gap-3 rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
        <MessageSquareQuote className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        Aún no tiene reseñas escritas. Solo pueden opinar clientes con una contratación finalizada.
      </p>
    );
  }

  return (
    <>
      {aviso && (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={cn(
            "mb-4 rounded-2xl p-3 text-sm font-semibold",
            aviso.tipo === "error" ? "bg-destructive/10 text-destructive" : "bg-verde/15",
          )}
        >
          {aviso.texto}{" "}
          {aviso.login && (
            <a
              href={`/api/auth/login?returnTo=${encodeURIComponent(`/trabajadores/${workerId}`)}`}
              className="underline underline-offset-4"
            >
              Ingresar
            </a>
          )}
        </p>
      )}
      <ul className="space-y-4">
        {items.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2">
                  <Estrellas valor={r.rating} />
                  <span className="font-bold">{r.authorName}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatearFecha(r.createdAt)}
                  {r.serviceName ? ` · ${r.serviceName}` : ""}
                  {r.edited ? " · editada" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDenunciando(r.id)}
                aria-label={`Denunciar la reseña de ${r.authorName}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <Flag className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {r.comment && <p className="mt-2 break-words whitespace-pre-wrap">{r.comment}</p>}
          </li>
        ))}
      </ul>
      {hayMas && (
        <button
          type="button"
          onClick={() => void verMas()}
          disabled={cargando}
          className={cn(boton({ variante: "secundario" }), "mt-4 w-full sm:w-auto")}
        >
          {cargando && <Loader2 className="animate-spin" aria-hidden />}
          Ver más reseñas
        </button>
      )}

      <Dialog open={denunciando !== null} onOpenChange={(a) => !a && setDenunciando(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          {denunciando && (
            <FormularioDenuncia
              reviewId={denunciando}
              motivos={motivos}
              onCerrar={(resultado) => {
                setDenunciando(null);
                if (resultado) setAviso(resultado);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioDenuncia({
  reviewId,
  motivos,
  onCerrar,
}: {
  reviewId: string;
  motivos: { code: string; label: string }[];
  onCerrar: (resultado?: { tipo: "ok" | "error"; texto: string; login?: boolean }) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setEnviando(true);
    const res = await fetch(`/api/v1/reviews/${reviewId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode: fd.get("reasonCode"), description: fd.get("description") }),
    });
    setEnviando(false);
    if (res.status === 401) {
      onCerrar({ tipo: "error", texto: "Para denunciar una reseña necesitas iniciar sesión.", login: true });
      return;
    }
    const err = res.ok ? null : ((await res.json().catch(() => ({}))) as { detail?: string });
    onCerrar(
      res.ok
        ? { tipo: "ok", texto: "Gracias. El GAD revisará la reseña." }
        : { tipo: "error", texto: err?.detail ?? "No pudimos enviar la denuncia." },
    );
  }
  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Denunciar reseña</DialogTitle>
        <DialogDescription>
          El personal del GAD la revisará. Quien la escribió no sabrá quién la denunció.
        </DialogDescription>
      </DialogHeader>
      <fieldset className="space-y-2">
        <legend className={etiqueta}>¿Qué pasa con esta reseña?</legend>
        {motivos.map((m, i) => (
          <label
            key={m.code}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="reasonCode"
              value={m.code}
              defaultChecked={i === 0}
              className="h-5 w-5 accent-primary"
            />
            {m.label}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="denuncia-resena-detalle" className={etiqueta}>
          Cuéntanos más <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id="denuncia-resena-detalle"
          name="description"
          rows={3}
          maxLength={1000}
          className={cn(campo, "min-h-24 resize-y")}
        />
      </div>
      <DialogFooter className="gap-2">
        <button type="button" onClick={() => onCerrar()} className={boton({ variante: "secundario" })}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className={boton({ variante: "peligro" })}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Enviar denuncia
        </button>
      </DialogFooter>
    </form>
  );
}
