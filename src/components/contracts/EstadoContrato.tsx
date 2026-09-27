import { Insignia } from "@/components/admin/AdminHeader";
import { cn } from "@/lib/utils";
import { ETIQUETAS_ESTADO, tonoEstado, type ContractStatus } from "@/server/domain/contracts/state-machine";

const estilos: Record<ReturnType<typeof tonoEstado>, string> = {
  alerta: "bg-amarillo/25 text-foreground [--punto:oklch(0.62_0.14_75)]",
  info: "bg-azul/12 text-foreground [--punto:var(--azul)]",
  exito: "bg-verde/20 text-foreground [--punto:var(--verde-fuerte)]",
  peligro: "bg-destructive/12 text-destructive [--punto:var(--destructive)]",
  neutro: "bg-muted text-muted-foreground [--punto:var(--muted-foreground)]",
};

export function EstadoContrato({ status, className }: { status: ContractStatus; className?: string }) {
  return <Insignia className={cn(estilos[tonoEstado(status)], className)}>{ETIQUETAS_ESTADO[status]}</Insignia>;
}
