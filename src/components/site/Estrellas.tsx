import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

const tamaños = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

/** Muestra una calificación de 0 a 5 (redondeada al entero más cercano). */
export function Estrellas({ valor, tamaño = "md" }: { valor: number; tamaño?: keyof typeof tamaños }) {
  const llenas = Math.round(Math.min(5, Math.max(0, valor)));

  return (
    <span role="img" className="inline-flex items-center gap-0.5" aria-label={`${llenas} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(tamaños[tamaño], i < llenas ? "fill-amarillo text-amarillo" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}
