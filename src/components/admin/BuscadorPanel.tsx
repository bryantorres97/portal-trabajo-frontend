import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { FormularioAutoEnvio } from "@/components/site/FormularioAutoEnvio";
import { boton } from "@/components/ui/boton";
import { cn } from "@/lib/utils";

/**
 * Barra de búsqueda de los listados del panel. Los filtros extra (selects, casillas) se aplican
 * solos al cambiar; el texto se envía con Enter o con el botón.
 */
export function BuscadorPanel({
  action,
  etiqueta,
  placeholder,
  q,
  children,
}: {
  action: string;
  etiqueta: string;
  placeholder: string;
  q?: string;
  children?: ReactNode;
}) {
  return (
    <FormularioAutoEnvio action={action} label={etiqueta} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <label className="relative min-w-0 flex-1 sm:min-w-64">
        <span className="sr-only">{etiqueta}</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={120}
          placeholder={placeholder}
          className="min-h-11 w-full rounded-xl border border-input bg-card pr-3 pl-10 text-base outline-none placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-ring/30 sm:text-sm"
        />
      </label>
      {children}
      <button type="submit" className={cn(boton({ tamano: "sm" }), "h-11")}>
        Buscar
      </button>
    </FormularioAutoEnvio>
  );
}
