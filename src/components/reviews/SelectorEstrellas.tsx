"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { ETIQUETAS_ESTRELLAS } from "@/server/domain/reviews/schemas";

/**
 * Elección de 1 a 5 estrellas con radios nativos: funciona con teclado (flechas) y lectores de
 * pantalla, y envía `rating` en el formulario.
 */
export function SelectorEstrellas({
  valor,
  onChange,
  nombre = "rating",
  invalido,
  descripcionId,
}: {
  valor: number;
  onChange: (valor: number) => void;
  nombre?: string;
  invalido?: boolean;
  descripcionId?: string;
}) {
  const [encima, setEncima] = useState(0);
  const mostrado = encima || valor;
  return (
    <fieldset aria-describedby={descripcionId} aria-invalid={invalido || undefined}>
      <legend className="text-sm font-bold">Tu calificación</legend>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="flex" onMouseLeave={() => setEncima(0)}>
          {ETIQUETAS_ESTRELLAS.map((etiqueta, i) => {
            const n = i + 1;
            return (
              <label
                key={n}
                onMouseEnter={() => setEncima(n)}
                className="grid h-12 w-12 cursor-pointer place-items-center rounded-xl has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="radio"
                  name={nombre}
                  value={n}
                  checked={valor === n}
                  onChange={() => onChange(n)}
                  className="sr-only"
                  aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}: ${etiqueta}`}
                />
                <Star
                  aria-hidden
                  className={cn(
                    "h-9 w-9 transition-transform",
                    n <= mostrado ? "fill-amarillo text-amarillo" : "text-muted-foreground/40",
                    n === encima && "scale-110",
                  )}
                />
              </label>
            );
          })}
        </div>
        <span className="min-w-20 text-sm font-bold text-muted-foreground" aria-hidden>
          {mostrado ? ETIQUETAS_ESTRELLAS[mostrado - 1] : "Elige de 1 a 5"}
        </span>
      </div>
    </fieldset>
  );
}
