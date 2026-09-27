import { Insignia } from "@/components/admin/AdminHeader";
import { cn } from "@/lib/utils";
import { ETIQUETAS_ESTADO, type WorkerStatus } from "@/server/domain/workers/state-machine";

const estilos: Record<WorkerStatus, string> = {
  REGISTRADO: "bg-azul/12 text-foreground [--punto:var(--azul)]",
  DOCUMENTACION_PENDIENTE: "bg-naranja/15 text-foreground [--punto:var(--naranja)]",
  PENDIENTE_REVISION: "bg-amarillo/25 text-foreground [--punto:oklch(0.62_0.14_75)]",
  CAPACITACION_PENDIENTE: "bg-naranja/15 text-foreground [--punto:var(--naranja)]",
  CAPACITACION_EN_PROCESO: "bg-azul/12 text-foreground [--punto:var(--azul)]",
  CAPACITACION_APROBADA: "bg-verde/12 text-foreground [--punto:var(--verde)]",
  HABILITADO: "bg-verde/20 text-foreground [--punto:var(--verde-fuerte)]",
  SUSPENDIDO: "bg-destructive/12 text-destructive [--punto:var(--destructive)]",
  RECHAZADO: "bg-muted text-muted-foreground [--punto:var(--muted-foreground)]",
  INACTIVO: "bg-muted text-muted-foreground [--punto:var(--muted-foreground)]",
};

export function EstadoTrabajador({ status, className }: { status: WorkerStatus; className?: string }) {
  return <Insignia className={cn(estilos[status], className)}>{ETIQUETAS_ESTADO[status]}</Insignia>;
}

const estilosDocumento: Record<string, string> = {
  PENDIENTE: "bg-amarillo/25 text-foreground [--punto:oklch(0.62_0.14_75)]",
  VALIDADO: "bg-verde/20 text-foreground [--punto:var(--verde-fuerte)]",
  RECHAZADO: "bg-destructive/12 text-destructive [--punto:var(--destructive)]",
  VENCIDO: "bg-naranja/15 text-foreground [--punto:var(--naranja)]",
  REEMPLAZADO: "bg-muted text-muted-foreground [--punto:var(--muted-foreground)]",
};

const etiquetasDocumento: Record<string, string> = {
  PENDIENTE: "Pendiente",
  VALIDADO: "Validado",
  RECHAZADO: "Rechazado",
  VENCIDO: "Vencido",
  REEMPLAZADO: "Reemplazado",
};

export function EstadoDocumento({ status }: { status: string }) {
  return <Insignia className={estilosDocumento[status]}>{etiquetasDocumento[status] ?? status}</Insignia>;
}

export const ETIQUETAS_INSCRIPCION: Record<string, string> = {
  INSCRITO: "Inscrito",
  EN_PROCESO: "En proceso",
  APROBADO: "Aprobado",
  REPROBADO: "Reprobado",
  ABANDONADO: "Abandonado",
};
