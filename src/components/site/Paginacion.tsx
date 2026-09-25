import Link from "next/link";

/** Paginación accesible basada en enlaces (funciona sin JavaScript). */
export function Paginacion({
  actual,
  total,
  enlace,
}: {
  actual: number;
  total: number;
  enlace: (p: number) => string;
}) {
  if (total <= 1) return null;
  return (
    <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3 text-sm">
      {actual > 1 ? (
        <Link href={enlace(actual - 1)} rel="prev" className="rounded-xl border border-border px-4 py-2 font-bold">
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground" aria-current="page">
        Página {actual} de {total}
      </span>
      {actual < total ? (
        <Link href={enlace(actual + 1)} rel="next" className="rounded-xl border border-border px-4 py-2 font-bold">
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
