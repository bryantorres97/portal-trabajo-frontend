"use client";

import Link from "next/link";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { boton } from "@/components/ui/boton";
import { ayuda, campo, etiqueta } from "@/components/ui/campo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type MotivoDenuncia = { code: string; label: string };

/**
 * Denuncia de un perfil, un cliente o una conversación (POST /api/v1/reports). Tras enviarla se
 * ofrece el seguimiento en «Mis denuncias».
 */
export function DenunciarDialogo({
  targetType,
  targetId,
  motivos,
  titulo,
  descripcion,
  abierto,
  onAbiertoChange,
  volverA,
}: {
  targetType: "WORKER" | "CLIENT" | "CONVERSATION";
  targetId: string;
  motivos: MotivoDenuncia[];
  titulo: string;
  descripcion: string;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Ruta a la que vuelve el ingreso si no hay sesión. */
  volverA: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ texto: string; login?: boolean } | null>(null);
  const [creada, setCreada] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const description = String(fd.get("description") ?? "").trim();
    if (description.length < 10) {
      setError({ texto: "Cuéntanos qué pasó (al menos 10 caracteres)." });
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reasonCode: fd.get("reasonCode"), description }),
    });
    setEnviando(false);
    if (res.status === 401) {
      setError({ texto: "Para denunciar necesitas iniciar sesión.", login: true });
      return;
    }
    const cuerpo = (await res.json().catch(() => ({}))) as { id?: string; detail?: string };
    if (!res.ok) {
      setError({ texto: cuerpo.detail ?? "No pudimos enviar la denuncia. Inténtalo de nuevo." });
      return;
    }
    setCreada(cuerpo.id ?? null);
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(a) => {
        onAbiertoChange(a);
        if (!a) {
          setCreada(null);
          setError(null);
        }
      }}
    >
      <DialogContent className="z-[70] max-h-[92dvh] max-w-md overflow-y-auto rounded-3xl">
        {creada ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-verde-fuerte" aria-hidden />
            <DialogHeader>
              <DialogTitle className="text-center">Recibimos tu denuncia</DialogTitle>
              <DialogDescription className="text-center">
                El personal del GAD la revisará. La otra persona no sabrá quién la hizo. Te avisaremos de cada novedad.
              </DialogDescription>
            </DialogHeader>
            <Link href={`/denuncias/${creada}`} className={cn(boton(), "w-full")}>
              Ver el seguimiento
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-destructive" aria-hidden /> {titulo}
              </DialogTitle>
              <DialogDescription>{descripcion}</DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-2">
              <legend className={etiqueta}>¿Qué pasó?</legend>
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
              <label htmlFor={`denuncia-${targetType}`} className={etiqueta}>
                Cuéntanos qué pasó
              </label>
              <textarea
                id={`denuncia-${targetType}`}
                name="description"
                rows={4}
                maxLength={1000}
                aria-describedby={`denuncia-${targetType}-ayuda`}
                className={cn(campo, "min-h-28 resize-y")}
              />
              <p id={`denuncia-${targetType}-ayuda`} className={ayuda}>
                Después podrás adjuntar capturas o documentos desde «Mis denuncias».
              </p>
            </div>
            {error && (
              <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
                {error.texto}{" "}
                {error.login && (
                  <a
                    href={`/api/auth/login?returnTo=${encodeURIComponent(volverA)}`}
                    className="underline underline-offset-4"
                  >
                    Ingresar
                  </a>
                )}
              </p>
            )}
            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => onAbiertoChange(false)}
                className={boton({ variante: "secundario" })}
              >
                Cancelar
              </button>
              <button type="submit" disabled={enviando} className={boton({ variante: "peligro" })}>
                {enviando && <Loader2 className="animate-spin" aria-hidden />}
                Enviar denuncia
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Enlace discreto «Denunciar este perfil» con su diálogo (perfil público). */
export function DenunciarPerfil({
  workerId,
  nombre,
  motivos,
}: {
  workerId: string;
  nombre: string;
  motivos: MotivoDenuncia[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-destructive"
      >
        <Flag className="h-4 w-4" aria-hidden /> Denunciar este perfil
      </button>
      <DenunciarDialogo
        targetType="WORKER"
        targetId={workerId}
        motivos={motivos}
        titulo={`Denunciar a ${nombre}`}
        descripcion="Si algo no está bien con este trabajador, cuéntanos. El GAD revisa cada denuncia."
        abierto={abierto}
        onAbiertoChange={setAbierto}
        volverA={`/trabajadores/${workerId}`}
      />
    </>
  );
}
