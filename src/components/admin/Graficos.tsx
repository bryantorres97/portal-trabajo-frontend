import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Gráficos simples del panel (una sola serie, un solo tono: magnitud). Barras finas con extremo
 * redondeado de 4 px y separación de 2 px, valor escrito junto a cada barra (no depende del color),
 * detalle al pasar el cursor (`title`) y tabla equivalente para lectores de pantalla.
 */

/** Cifra destacada con su contexto. */
export function Indicador({
  titulo,
  valor,
  detalle,
  alerta,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className={cn("tarjeta p-4", alerta && "ring-2 ring-destructive/40")}>
      <p className="text-sm font-bold text-muted-foreground">{titulo}</p>
      <p className={cn("mt-1 text-3xl font-extrabold tabular-nums", alerta && "text-destructive")}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

/** Barras horizontales ordenadas (distribución por categoría o estado). */
export function BarrasHorizontales({
  titulo,
  datos,
  vacio = "Sin datos",
}: {
  titulo: string;
  datos: { etiqueta: string; valor: number }[];
  vacio?: string;
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <figure>
      <figcaption className="sr-only">{titulo}</figcaption>
      {datos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {datos.map((d) => (
              <tr key={d.etiqueta} title={`${d.etiqueta}: ${d.valor}`}>
                <th
                  scope="row"
                  className="w-40 max-w-40 truncate py-1 pr-3 text-left font-normal text-muted-foreground"
                >
                  {d.etiqueta}
                </th>
                <td className="py-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 rounded-r-[4px] bg-primary"
                      style={{ width: `${Math.max((d.valor / max) * 100, d.valor > 0 ? 2 : 0)}%` }}
                      aria-hidden
                    />
                    <span className="font-bold tabular-nums">{d.valor}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}

/** Columnas por semana (una serie). Cada columna muestra su valor al pasar el cursor. */
export function ColumnasSemanales({ titulo, datos }: { titulo: string; datos: { etiqueta: string; valor: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const total = datos.reduce((s, d) => s + d.valor, 0);
  return (
    <figure className="tarjeta p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{titulo}</span>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{total} en total</span>
      </figcaption>
      <div
        className="mt-3 flex h-24 items-end gap-0.5"
        role="img"
        aria-label={`${titulo}: ${total} en ${datos.length} semanas`}
      >
        {datos.map((d) => (
          <div
            key={d.etiqueta}
            title={`Semana del ${d.etiqueta}: ${d.valor}`}
            className="group relative flex h-full flex-1 items-end"
          >
            <div
              className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-75"
              style={{ height: `${d.valor > 0 ? Math.max((d.valor / max) * 100, 4) : 0}%` }}
            />
            {d.valor === 0 && <div className="h-px w-full bg-border" />}
          </div>
        ))}
      </div>
      <p className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{datos[0]?.etiqueta}</span>
        <span>{datos.at(-1)?.etiqueta}</span>
      </p>
    </figure>
  );
}
