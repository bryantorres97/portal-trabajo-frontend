import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Miga = { href?: string; label: string };

/** Encabezado del panel GAD con migas de pan. */
export function AdminHeader({ migas, titulo, descripcion }: { migas: Miga[]; titulo: string; descripcion?: string }) {
  return (
    <header className="px-4 pt-8 pb-4">
      <nav aria-label="Ruta" className="text-xs font-semibold text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/admin" className="hover:text-foreground">
              Panel GAD
            </Link>
          </li>
          {migas.map((m) => (
            <li key={m.label} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" aria-hidden />
              {m.href ? (
                <Link href={m.href} className="hover:text-foreground">
                  {m.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  {m.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <h1 className="mt-2 text-3xl leading-tight font-extrabold">{titulo}</h1>
      {descripcion && <p className="mt-2 max-w-3xl text-base text-muted-foreground">{descripcion}</p>}
    </header>
  );
}

export function EstadoUsuario({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    ACTIVO: "bg-verde/15 text-foreground",
    BLOQUEADO: "bg-destructive/15 text-destructive",
    ELIMINADO: "bg-muted text-muted-foreground",
  };
  const etiquetas: Record<string, string> = { ACTIVO: "Activo", BLOQUEADO: "Bloqueado", ELIMINADO: "Eliminado" };
  return (
    <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-bold ${estilos[status] ?? ""}`}>
      {etiquetas[status] ?? status}
    </span>
  );
}
