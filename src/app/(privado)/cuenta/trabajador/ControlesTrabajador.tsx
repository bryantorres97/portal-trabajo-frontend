"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useActionState, useEffect, useState, type ChangeEvent } from "react";

import { ActionForm } from "@/components/forms/ActionForm";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

type Accion = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Interruptor de disponibilidad: tocarlo cambia el estado (es el botón del formulario). */
export function InterruptorDisponibilidad({ action, disponible }: { action: Accion; disponible: boolean }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="isAvailable" value={disponible ? "false" : "true"} />
      <button
        type="submit"
        role="switch"
        aria-checked={disponible}
        disabled={pending}
        className={cn(
          "flex w-full items-center gap-4 rounded-2xl p-4 text-left font-bold transition-colors disabled:opacity-70",
          disponible ? "bg-verde/15 text-verde-fuerte" : "bg-secondary text-muted-foreground hover:bg-secondary/70",
        )}
      >
        <span
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200",
            disponible ? "bg-verde" : "bg-muted-foreground/40",
          )}
          aria-hidden
        >
          <span
            className={cn(
              "absolute top-1 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-[left] duration-200 ease-out",
              disponible ? "left-7" : "left-1",
            )}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </span>
        </span>
        <span>
          <span className="block text-base">{disponible ? "Estoy disponible" : "No estoy disponible"}</span>
          <span className="block text-sm font-normal text-muted-foreground">Toca para cambiar</span>
        </span>
      </button>
      {state.status === "error" && state.message && (
        <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Subida de foto con vista previa antes de enviarla. */
export function SubirFoto({ action }: { action: Accion }) {
  const [vista, setVista] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => () => void (vista && URL.revokeObjectURL(vista)), [vista]);

  function alElegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    setNombre(archivo?.name ?? null);
    setVista(archivo && archivo.type.startsWith("image/") ? URL.createObjectURL(archivo) : null);
  }

  return (
    <ActionForm action={action} submitLabel="Enviar foto" pendingLabel="Subiendo…" className="mt-4">
      <label
        htmlFor="foto"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 has-[:focus-visible]:border-primary"
      >
        {vista ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img src={vista} alt="Vista previa de la foto elegida" className="h-32 w-32 rounded-2xl object-cover" />
        ) : (
          <ImageUp className="h-9 w-9 text-primary" aria-hidden />
        )}
        <span className="font-bold">{nombre ? "Cambiar foto" : "Elegir o tomar una foto"}</span>
        <span className="max-w-full truncate text-xs text-muted-foreground">
          {nombre ?? "JPG, PNG o WEBP · máximo 4 MB"}
        </span>
        <input
          id="foto"
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          onChange={alElegir}
          className="sr-only"
        />
      </label>
    </ActionForm>
  );
}
