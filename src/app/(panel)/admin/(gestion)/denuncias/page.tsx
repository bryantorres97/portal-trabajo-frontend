import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, Inbox } from "lucide-react";

import { AdminHeader, tabla } from "@/components/admin/AdminHeader";
import { EstadoDenuncia, PrioridadDenuncia } from "@/components/reports/EstadoDenuncia";
import { Paginacion } from "@/components/site/Paginacion";
import { formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import { ETIQUETAS_OBJETIVO, ETIQUETAS_VISTA, VISTAS, type VistaBandeja } from "@/server/domain/reports/state-machine";
import { DENUNCIAS_POR_PAGINA, listReports, reportsSummary } from "@/server/reports/admin";

export const metadata: Metadata = { title: "Denuncias · Panel GAD" };

const CONTADORES: Partial<Record<VistaBandeja, keyof Awaited<ReturnType<typeof reportsSummary>>>> = {
  por_atender: "porAtender",
  mias: "mias",
  sin_asignar: "sinAsignar",
  escaladas: "escaladas",
  vencidas: "vencidas",
};

/** Bandeja de denuncias: prioridad, plazo y asignación. */
export default async function DenunciasAdminPage({ searchParams }: PageProps<"/admin/denuncias">) {
  const actor = await requirePagePermission("report.read", "/admin/denuncias");
  const sp = await searchParams;
  const pagina = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const [{ items, total, vista }, resumen] = await Promise.all([
    listReports(actor, typeof sp.ver === "string" ? sp.ver : undefined, pagina),
    reportsSummary(actor),
  ]);
  const paginas = Math.max(1, Math.ceil(total / DENUNCIAS_POR_PAGINA));

  return (
    <>
      <AdminHeader
        titulo="Denuncias"
        descripcion="Casos reportados por la ciudadanía. Ordenados por prioridad y plazo. El contenido de las conversaciones solo se ve con una justificación, que queda registrada."
      />

      <nav aria-label="Vistas de la bandeja" className="-mx-1 flex gap-1 overflow-x-auto pb-2">
        {VISTAS.map((v) => {
          const n = CONTADORES[v] ? resumen[CONTADORES[v]] : null;
          return (
            <Link
              key={v}
              href={`/admin/denuncias?ver=${v}`}
              aria-current={vista === v ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-bold",
                vista === v
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
                v === "vencidas" && n ? "text-destructive" : "",
                vista === v && "text-primary-foreground",
              )}
            >
              {ETIQUETAS_VISTA[v]}
              {n != null && n > 0 && (
                <span className={cn("rounded-full px-1.5 text-xs", vista === v ? "bg-white/20" : "bg-card")}>{n}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <p className="mt-4 mb-3 text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? "No hay denuncias en esta vista." : `${total} denuncia${total === 1 ? "" : "s"}`}
      </p>

      {items.length === 0 ? (
        <div className="grid place-items-center tarjeta px-6 py-14 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-bold">Nada pendiente aquí</p>
        </div>
      ) : (
        <div className={tabla.marco}>
          <table className={tabla.tabla}>
            <thead className={tabla.encabezado}>
              <tr>
                <th scope="col" className={tabla.th}>
                  Denuncia
                </th>
                <th scope="col" className={cn(tabla.th, "hidden md:table-cell")}>
                  Estado
                </th>
                <th scope="col" className={cn(tabla.th, "hidden lg:table-cell")}>
                  Asignada a
                </th>
                <th scope="col" className={cn(tabla.th, "hidden sm:table-cell")}>
                  Plazo
                </th>
              </tr>
            </thead>
            <tbody className={tabla.cuerpo}>
              {items.map((r) => (
                <tr key={r.id} className={tabla.fila}>
                  <td className={tabla.td}>
                    <div className="flex flex-wrap items-center gap-2">
                      <PrioridadDenuncia prioridad={r.priority} />
                      <span className="text-xs font-bold text-muted-foreground">
                        {ETIQUETAS_OBJETIVO[r.targetType]}
                      </span>
                    </div>
                    <Link
                      href={`/admin/denuncias/${r.id}`}
                      className="mt-1 block font-bold text-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      {r.reasonLabel}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.targetLabel}
                      {r.reportedName ? ` · denunciado: ${r.reportedName}` : ""}
                    </p>
                    <p className="mt-1.5 md:hidden">
                      <EstadoDenuncia status={r.status} />
                    </p>
                  </td>
                  <td className={cn(tabla.td, "hidden md:table-cell")}>
                    <EstadoDenuncia status={r.status} />
                  </td>
                  <td className={cn(tabla.td, "hidden text-muted-foreground lg:table-cell")}>
                    {r.assignedName ?? "—"}
                  </td>
                  <td className={cn(tabla.td, "hidden whitespace-nowrap tabular-nums sm:table-cell")}>
                    {r.overdue ? (
                      <span className="inline-flex items-center gap-1 font-bold text-destructive">
                        <AlarmClock className="h-4 w-4" aria-hidden /> Vencida
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{formatearFechaHora(r.dueAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion
        actual={pagina}
        total={paginas}
        enlace={(p) => `/admin/denuncias?${new URLSearchParams({ ver: vista, page: String(p) })}`}
      />
    </>
  );
}
