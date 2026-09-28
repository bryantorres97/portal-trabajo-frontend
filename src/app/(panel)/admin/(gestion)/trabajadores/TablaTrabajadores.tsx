import Link from "next/link";
import { ImageUp, Link2 } from "lucide-react";

import { tabla } from "@/components/admin/AdminHeader";
import { EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { formatearFecha } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { WorkerListItem } from "@/server/workers/admin";

export function TablaTrabajadores({ items }: { items: WorkerListItem[] }) {
  return (
    <div className={tabla.marco}>
      <table className={tabla.tabla}>
        <thead className={tabla.encabezado}>
          <tr>
            <th scope="col" className={tabla.th}>
              Trabajador
            </th>
            <th scope="col" className={cn(tabla.th, "hidden md:table-cell")}>
              Oficios
            </th>
            <th scope="col" className={cn(tabla.th, "hidden sm:table-cell")}>
              Estado
            </th>
            <th scope="col" className={cn(tabla.th, "hidden lg:table-cell")}>
              Último cambio
            </th>
          </tr>
        </thead>
        <tbody className={tabla.cuerpo}>
          {items.map((w) => (
            <tr key={w.id} className={tabla.fila}>
              <td className={tabla.td}>
                <Link
                  href={`/admin/trabajadores/${w.id}`}
                  className="font-bold text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {w.displayName}
                </Link>
                {w.legalName && (
                  <p className="text-xs text-muted-foreground">
                    {w.legalName}
                    {w.phone ? ` · ${w.phone}` : ""}
                  </p>
                )}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="sm:hidden">
                    <EstadoTrabajador status={w.status} />
                  </span>
                  {w.linked && (
                    <span className="inline-flex items-center gap-1 font-semibold text-verde-fuerte">
                      <Link2 className="h-3 w-3" aria-hidden /> Cuenta vinculada
                    </span>
                  )}
                  {w.pendingReview && (
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <ImageUp className="h-3 w-3 text-naranja" aria-hidden /> Cambios por aprobar
                    </span>
                  )}
                </p>
              </td>
              <td className={cn(tabla.td, "hidden text-muted-foreground md:table-cell")}>
                {w.services.join(", ") || "—"}
              </td>
              <td className={cn(tabla.td, "hidden sm:table-cell")}>
                <EstadoTrabajador status={w.status} />
              </td>
              <td className={cn(tabla.td, "hidden whitespace-nowrap text-muted-foreground tabular-nums lg:table-cell")}>
                {formatearFecha(w.statusChangedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
