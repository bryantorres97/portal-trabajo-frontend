"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useActionState, type ReactNode } from "react";

import { boton } from "@/components/ui/boton";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((state: ActionState) => ReactNode);
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /** "sm" para acciones en línea (validar, revocar…) en listas densas del panel. */
  tamano?: "sm" | "md";
  className?: string;
  /** Oculta el mensaje de éxito (p. ej. cuando la acción redirige). */
  silentSuccess?: boolean;
};

const variantes = { primary: "primario", secondary: "secundario", danger: "peligro" } as const;

/** Formulario ligado a una Server Action con estado de carga y mensajes accesibles. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Guardando…",
  variant = "primary",
  tamano = "md",
  className,
  silentSuccess,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className={cn("space-y-4", className)} noValidate>
      {typeof children === "function" ? children(state) : children}
      {state.message && !(silentSuccess && state.status === "ok") && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold",
            state.status === "error" ? "bg-destructive/10 text-destructive" : "bg-verde/15 text-foreground",
          )}
        >
          {state.status === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verde-fuerte" aria-hidden />
          )}
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className={boton({ variante: variantes[variant], tamano })}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

/** Mensajes de error de un campo, enlazados con `aria-describedby`. */
export function FieldError({ id, state, name }: { id: string; state: ActionState; name: string }) {
  const errores = state.fieldErrors?.[name];
  if (!errores?.length) return null;
  return (
    <p id={id} className="mt-1 text-sm font-semibold text-destructive">
      {errores.join(" ")}
    </p>
  );
}
