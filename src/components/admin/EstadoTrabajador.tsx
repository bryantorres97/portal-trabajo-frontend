import { cn } from "@/lib/utils";
import { ETIQUETAS_ESTADO, type WorkerStatus } from "@/server/domain/workers/state-machine";

const estilos: Record<WorkerStatus, string> = {
  REGISTRADO: "bg-azul/15 text-foreground",
  DOCUMENTACION_PENDIENTE: "bg-naranja/20 text-foreground",
  PENDIENTE_REVISION: "bg-amarillo/25 text-foreground",
  CAPACITACION_PENDIENTE: "bg-naranja/20 text-foreground",
  CAPACITACION_EN_PROCESO: "bg-azul/15 text-foreground",
  CAPACITACION_APROBADA: "bg-verde/15 text-foreground",
  HABILITADO: "bg-verde/25 text-foreground",
  SUSPENDIDO: "bg-destructive/15 text-destructive",
  RECHAZADO: "bg-muted text-muted-foreground",
  INACTIVO: "bg-muted text-muted-foreground",
};

export function EstadoTrabajador({ status, className }: { status: WorkerStatus; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-lg px-2 py-0.5 text-xs font-bold", estilos[status], className)}>
      {ETIQUETAS_ESTADO[status]}
    </span>
  );
}

const estilosDocumento: Record<string, string> = {
  PENDIENTE: "bg-amarillo/25 text-foreground",
  VALIDADO: "bg-verde/20 text-foreground",
  RECHAZADO: "bg-destructive/15 text-destructive",
  VENCIDO: "bg-naranja/20 text-foreground",
  REEMPLAZADO: "bg-muted text-muted-foreground",
};

const etiquetasDocumento: Record<string, string> = {
  PENDIENTE: "Pendiente",
  VALIDADO: "Validado",
  RECHAZADO: "Rechazado",
  VENCIDO: "Vencido",
  REEMPLAZADO: "Reemplazado",
};

export function EstadoDocumento({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-lg px-2 py-0.5 text-xs font-bold", estilosDocumento[status])}>
      {etiquetasDocumento[status] ?? status}
    </span>
  );
}

export const ETIQUETAS_INSCRIPCION: Record<string, string> = {
  INSCRITO: "Inscrito",
  EN_PROCESO: "En proceso",
  APROBADO: "Aprobado",
  REPROBADO: "Reprobado",
  ABANDONADO: "Abandonado",
};
