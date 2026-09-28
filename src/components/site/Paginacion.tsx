import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { boton } from "@/components/ui/boton";

/** Paginación accesible basada en enlaces (funciona sin JavaScript). */
export function Paginacion({
  actual,
  total,
  enlace,
}: {
  actual: number;
  total: number;
  enlace: (p: number) => string;
}) {
  if (total <= 1) return null;
  return (
    <nav aria-label="Paginación" className="mt-10 flex items-center justify-between gap-3 text-sm">
      {actual > 1 ? (
        <Link href={enlace(actual - 1)} rel="prev" className={boton({ variante: "secundario", tamano: "sm" })}>
          <ChevronLeft aria-hidden /> Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground tabular-nums" aria-current="page">
        Página {actual} de {total}
      </span>
      {actual < total ? (
        <Link href={enlace(actual + 1)} rel="next" className={boton({ variante: "secundario", tamano: "sm" })}>
          Siguiente <ChevronRight aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
