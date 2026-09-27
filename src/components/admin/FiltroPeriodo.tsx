import Link from "next/link";
import type { ReactNode } from "react";

import { boton } from "@/components/ui/boton";
import { campoCompacto, etiqueta } from "@/components/ui/campo";
import { cn } from "@/lib/utils";
import { PERIODOS, type Periodo } from "@/server/domain/panel/schemas";

const ETIQUETAS: Record<Periodo, string> = { "7d": "7 días", "30d": "30 días", "90d": "90 días", "365d": "12 meses" };

/**
 * Filtros en una sola fila sobre el contenido: periodos rápidos y rango personalizado (días de Ecuador).
 * Formulario GET: la URL conserva el filtro (se puede compartir y volver).
 */
export function FiltroPeriodo({
  ruta,
  desde,
  hasta,
  periodo,
  conservar = {},
  children,
}: {
  ruta: string;
  desde: string;
  hasta: string;
  periodo: Periodo | null;
  /** Otros parámetros de la URL que se mantienen (tipo, estado…). */
  conservar?: Record<string, string>;
  /** Controles adicionales (p. ej. el estado del reporte). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 tarjeta p-4">
      <nav aria-label="Periodo" className="flex flex-wrap gap-1">
        {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
          <Link
            key={p}
            href={`${ruta}?${new URLSearchParams({ ...conservar, periodo: p })}`}
            aria-current={periodo === p ? "true" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-bold",
              periodo === p
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {ETIQUETAS[p]}
          </Link>
        ))}
      </nav>
      <form action={ruta} className="flex flex-wrap items-end gap-3">
        {Object.entries(conservar).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div>
          <label htmlFor="desde" className={etiqueta}>
            Desde
          </label>
          <input id="desde" name="desde" type="date" defaultValue={desde} className={campoCompacto} />
        </div>
        <div>
          <label htmlFor="hasta" className={etiqueta}>
            Hasta
          </label>
          <input id="hasta" name="hasta" type="date" defaultValue={hasta} className={campoCompacto} />
        </div>
        {children}
        <button type="submit" className={cn(boton({ tamano: "sm" }), "h-11")}>
          Aplicar
        </button>
      </form>
    </div>
  );
}
