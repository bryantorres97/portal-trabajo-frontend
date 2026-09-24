import { cn } from "@/lib/utils";

/**
 * Logotipo temporal en texto. Reemplazar por los archivos oficiales
 * (acolita-logo-nuevo.png / ambato-logo.png) cuando el GAD los entregue — bloqueo B1.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-2xl leading-none font-extrabold tracking-tight", className)}>
      <span className="texto-marca">Acolita</span>
      <span className="text-foreground">.App</span>
    </span>
  );
}

export function LogoInstitucional({ className }: { className?: string }) {
  return (
    <span className={cn("block leading-tight", className)}>
      <span className="block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        GAD Municipalidad de
      </span>
      <span className="block font-display text-xl font-extrabold text-foreground">Ambato</span>
    </span>
  );
}
