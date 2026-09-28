"use client";

import type { FormEvent, ReactNode } from "react";

/**
 * Formulario GET que se envía solo al cambiar un filtro (select o casilla). Sin JavaScript sigue
 * funcionando con su botón de envío.
 */
export function FormularioAutoEnvio({
  action,
  className,
  children,
  label,
}: {
  action: string;
  className?: string;
  children: ReactNode;
  label: string;
}) {
  function alCambiar(e: FormEvent<HTMLFormElement>) {
    const campo = e.target as HTMLInputElement | HTMLSelectElement;
    if (campo.tagName === "SELECT" || (campo.tagName === "INPUT" && campo.type === "checkbox")) {
      e.currentTarget.requestSubmit();
    }
  }
  return (
    <form role="search" aria-label={label} action={action} method="get" onChange={alCambiar} className={className}>
      {children}
    </form>
  );
}
