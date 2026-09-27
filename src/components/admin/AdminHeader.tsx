import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Miga = { href?: string; label: string };

/**
 * Encabezado de página del panel GAD. Las migas solo aparecen en pantallas de detalle: en las
 * secciones principales la barra lateral ya indica dónde está el funcionario.
 */
export function AdminHeader({
  migas = [],
  titulo,
  descripcion,
  acciones,
  children,
}: {
  migas?: Miga[];
  titulo: string;
  descripcion?: ReactNode;
  /** Botones a la derecha del título (o debajo, en móvil). */
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  const conMigas = migas.some((m) => m.href);
  return (
    <header className="pt-6 pb-6 lg:pt-10">
      {conMigas && (
        <nav aria-label="Ruta" className="mb-3 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            {migas.map((m, i) => (
              <li key={m.label} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {m.href ? (
                  <Link
                    href={m.href}
                    className="font-semibold underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    {m.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate">
                    {m.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold break-words sm:text-[2rem]">{titulo}</h1>
          {descripcion && <div className="mt-1.5 max-w-3xl text-base text-muted-foreground">{descripcion}</div>}
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>}
      </div>
      {children}
    </header>
  );
}

/** Bloque de contenido del panel: tarjeta con título y, opcionalmente, acciones a la derecha. */
export function Bloque({
  titulo,
  descripcion,
  acciones,
  children,
  className,
  cuerpo = "p-5",
}: {
  titulo?: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Relleno del cuerpo; "" para listas y tablas que llegan al borde. */
  cuerpo?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={titulo ? id : undefined} className={cn("tarjeta", className)}>
      {titulo && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5">
          <div className="min-w-0">
            <h2 id={id} className="text-lg leading-snug font-bold">
              {titulo}
            </h2>
            {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
          </div>
          {acciones}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

/** Aviso de éxito o de error dentro del panel. */
export function Aviso({
  tipo,
  children,
  className,
}: {
  tipo: "exito" | "error";
  children: ReactNode;
  className?: string;
}) {
  const error = tipo === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold",
        error ? "bg-destructive/10 text-destructive" : "bg-verde/15 text-foreground",
        className,
      )}
    >
      {error ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verde-fuerte" aria-hidden />
      )}
      <span>{children}</span>
    </p>
  );
}

/** Estilos de tabla compartidos por los listados del panel. */
export const tabla = {
  marco: "tarjeta overflow-hidden",
  tabla: "w-full text-left text-sm",
  encabezado: "border-b border-border/80 bg-secondary/60",
  th: "px-4 py-3 text-xs font-semibold text-muted-foreground",
  cuerpo: "divide-y divide-border/70",
  fila: "transition-colors hover:bg-secondary/40",
  td: "px-4 py-3.5 align-top",
};

export function EstadoUsuario({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    ACTIVO: "bg-verde/15 text-foreground [--punto:var(--verde)]",
    BLOQUEADO: "bg-destructive/12 text-destructive [--punto:var(--destructive)]",
    ELIMINADO: "bg-muted text-muted-foreground [--punto:var(--muted-foreground)]",
  };
  const etiquetas: Record<string, string> = { ACTIVO: "Activo", BLOQUEADO: "Bloqueado", ELIMINADO: "Eliminado" };
  return <Insignia className={estilos[status]}>{etiquetas[status] ?? status}</Insignia>;
}

/** Insignia de estado con punto de color (el color no es la única señal: siempre lleva texto). */
export function Insignia({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--punto,currentColor)]" aria-hidden />
      {children}
    </span>
  );
}
