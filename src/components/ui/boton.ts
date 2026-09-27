import { cva, type VariantProps } from "class-variance-authority";

/**
 * Botones y enlaces con forma de botón del portal. Sin "use client": sirve en componentes de
 * servidor (`<Link className={boton()}>`). Área táctil mínima de 44 px.
 */
export const boton = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl font-bold whitespace-nowrap transition-[background-color,box-shadow,transform,color] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variante: {
        primario: "bg-primary text-primary-foreground shadow-[var(--shadow-suave)] hover:bg-primary/90",
        secundario: "border border-border bg-card text-foreground hover:border-primary/30 hover:bg-secondary",
        suave: "bg-primary/10 text-primary hover:bg-primary/15",
        fantasma: "text-foreground hover:bg-secondary",
        peligro: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        claro: "bg-white text-primary shadow-[var(--shadow-suave)] hover:bg-white/90",
      },
      tamano: {
        sm: "min-h-10 px-4 text-sm [&_svg]:size-4",
        md: "min-h-12 px-5 text-sm [&_svg]:size-4",
        lg: "min-h-14 px-6 text-base [&_svg]:size-5",
      },
    },
    defaultVariants: { variante: "primario", tamano: "md" },
  },
);

export type BotonProps = VariantProps<typeof boton>;
