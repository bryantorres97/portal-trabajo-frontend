/**
 * Estilos de campos de formulario del portal (sin "use client": sirven en servidor y cliente).
 * Altura cómoda para el dedo, texto de 16 px (evita el zoom automático en iOS) y estado de error.
 */
export const campo =
  "mt-1.5 block w-full min-h-12 rounded-2xl border border-input bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-ring/30 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 disabled:opacity-60";

/** Variante compacta para tablas y paneles densos del personal. */
export const campoCompacto =
  "mt-1 block w-full min-h-11 rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-ring/30 aria-[invalid=true]:border-destructive";

export const etiqueta = "block text-sm font-bold text-foreground";
export const ayuda = "mt-1.5 text-sm text-muted-foreground";
