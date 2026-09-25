"use client";

import { Loader2 } from "lucide-react";
import { useActionState, type ReactNode } from "react";

import { initialActionState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((state: ActionState) => ReactNode);
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  /** Oculta el mensaje de éxito (p. ej. cuando la acción redirige). */
  silentSuccess?: boolean;
};

const estilos = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:bg-secondary",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

/** Formulario ligado a una Server Action con estado de carga y mensajes accesibles. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Guardando…",
  variant = "primary",
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
            "rounded-xl p-3 text-sm font-semibold",
            state.status === "error" ? "bg-destructive/10 text-destructive" : "bg-verde/10 text-foreground",
          )}
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors disabled:opacity-70",
          estilos[variant],
        )}
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
