import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkerStatus } from "@/server/domain/workers/state-machine";

const PASOS = ["Registro", "Documentos", "Capacitación", "Habilitado"] as const;

function pasoActual(s: WorkerStatus): number {
  if (s === "REGISTRADO") return 0;
  if (s === "DOCUMENTACION_PENDIENTE" || s === "PENDIENTE_REVISION") return 1;
  if (s.startsWith("CAPACITACION")) return s === "CAPACITACION_APROBADA" ? 2.5 : 2;
  return 3;
}

/** Suspendido, inactivo o rechazado: el avance no aplica. */
export function habilitacionDetenida(s: WorkerStatus): boolean {
  return s === "SUSPENDIDO" || s === "INACTIVO" || s === "RECHAZADO";
}

/** Barra de avance de la habilitación (Registro → Documentos → Capacitación → Habilitado). */
export function AvanceHabilitacion({
  status,
  etiqueta,
  className,
}: {
  status: WorkerStatus;
  etiqueta: string;
  className?: string;
}) {
  const paso = pasoActual(status);
  return (
    <ol className={cn("grid grid-cols-4 gap-2", className)} aria-label={etiqueta}>
      {PASOS.map((p, i) => {
        const hecho = i < paso || (i === 3 && paso === 3);
        const actual = !hecho && i === Math.ceil(paso);
        return (
          <li key={p} className="flex flex-col gap-2" aria-current={actual ? "step" : undefined}>
            <span className={cn("h-2 rounded-full", hecho ? "bg-verde" : actual ? "bg-primary" : "bg-secondary")} />
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-bold sm:text-sm",
                hecho ? "text-verde-fuerte" : actual ? "text-primary" : "text-muted-foreground",
              )}
            >
              {hecho && <Check className="h-3.5 w-3.5" aria-hidden />}
              {p}
              <span className="sr-only">{hecho ? " (completado)" : actual ? " (en curso)" : " (pendiente)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
