"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";

/** URL del formulario GET sin los campos vacíos (mismo resultado que el envío nativo, más limpio). */
function urlDelFormulario(form: HTMLFormElement, action: string): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of new FormData(form)) {
    if (typeof valor === "string" && valor.trim() !== "") params.append(clave, valor.trim());
  }
  const qs = params.toString();
  return qs ? `${action}?${qs}` : action;
}

/**
 * Formulario GET que se envía solo al cambiar un filtro (select o casilla). Sin JavaScript sigue
 * funcionando con su botón de envío.
 *
 * Con `esperaAlEscribir` (ms), el texto también filtra solo, un momento después de la última tecla,
 * y todo se aplica con navegación del cliente: no se pierde el foco, el texto ni el scroll. Mientras
 * carga, el formulario lleva `data-pendiente` (para atenuar los resultados con CSS).
 */
export function FormularioAutoEnvio({
  action,
  className,
  children,
  label,
  esperaAlEscribir,
}: {
  action: string;
  className?: string;
  children: ReactNode;
  label: string;
  esperaAlEscribir?: number;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  function navegar(form: HTMLFormElement, reemplazar: boolean) {
    clearTimeout(temporizador.current);
    const destino = urlDelFormulario(form, action);
    if (destino === `${window.location.pathname}${window.location.search}`) return;
    startTransition(() => {
      if (reemplazar) router.replace(destino, { scroll: false });
      else router.push(destino, { scroll: false });
    });
  }

  function alCambiar(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const campo = e.target as HTMLInputElement | HTMLSelectElement;
    const esFiltro = campo.tagName === "SELECT" || (campo.tagName === "INPUT" && campo.type === "checkbox");
    if (esperaAlEscribir === undefined) {
      if (esFiltro) form.requestSubmit();
      return;
    }
    if (esFiltro) return navegar(form, false);
    if (campo.tagName === "INPUT" && (campo.type === "search" || campo.type === "text")) {
      // Una sola letra no ayuda a buscar: se espera a la segunda (o a que se borre todo).
      if (campo.value.trim().length === 1) return clearTimeout(temporizador.current);
      clearTimeout(temporizador.current);
      // El historial no guarda cada pausa al escribir: se reemplaza la entrada actual.
      temporizador.current = setTimeout(() => navegar(form, true), esperaAlEscribir);
    }
  }

  function alEnviar(e: FormEvent<HTMLFormElement>) {
    if (esperaAlEscribir === undefined) return;
    e.preventDefault();
    navegar(e.currentTarget, false);
  }

  return (
    <form
      role="search"
      aria-label={label}
      action={action}
      method="get"
      onChange={alCambiar}
      onSubmit={alEnviar}
      aria-busy={pendiente || undefined}
      data-pendiente={pendiente ? "" : undefined}
      className={className}
    >
      {children}
    </form>
  );
}
