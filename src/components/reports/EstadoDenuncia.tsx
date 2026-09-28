import { Insignia } from "@/components/admin/AdminHeader";
import { cn } from "@/lib/utils";
import { ETIQUETAS_ESTADO, PRIORIDADES, type ReportStatus } from "@/server/domain/reports/state-machine";

const estilos: Record<ReportStatus, string> = {
  ABIERTA: "bg-azul/12 text-foreground [--punto:var(--azul)]",
  EN_REVISION: "bg-amarillo/25 text-foreground [--punto:oklch(0.62_0.14_75)]",
  EN_ESPERA_DE_INFORMACION: "bg-naranja/15 text-foreground [--punto:var(--naranja)]",
  ESCALADA: "bg-magenta/12 text-foreground [--punto:var(--magenta)]",
  RESUELTA: "bg-verde/20 text-foreground [--punto:var(--verde-fuerte)]",
  DESCARTADA: "bg-muted text-muted-foreground [--punto:var(--muted-foreground)]",
};

export function EstadoDenuncia({ status, className }: { status: ReportStatus; className?: string }) {
  return <Insignia className={cn(estilos[status], className)}>{ETIQUETAS_ESTADO[status]}</Insignia>;
}

const estilosPrioridad = {
  1: "bg-destructive/12 text-destructive [--punto:var(--destructive)]",
  2: "bg-amarillo/25 text-foreground [--punto:oklch(0.62_0.14_75)]",
  3: "bg-muted text-muted-foreground [--punto:var(--muted-foreground)]",
} as const;

export function PrioridadDenuncia({ prioridad }: { prioridad: 1 | 2 | 3 }) {
  return <Insignia className={estilosPrioridad[prioridad]}>Prioridad {PRIORIDADES[prioridad].toLowerCase()}</Insignia>;
}
