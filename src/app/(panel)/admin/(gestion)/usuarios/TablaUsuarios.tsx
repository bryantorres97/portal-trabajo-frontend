import Link from "next/link";

import { EstadoUsuario, tabla } from "@/components/admin/AdminHeader";
import { etiquetaRol, formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { UserListItem } from "@/server/users/admin";

export function TablaUsuarios({ items }: { items: UserListItem[] }) {
  return (
    <div className={tabla.marco}>
      <table className={tabla.tabla}>
        <thead className={tabla.encabezado}>
          <tr>
            <th scope="col" className={tabla.th}>
              Usuario
            </th>
            <th scope="col" className={cn(tabla.th, "hidden md:table-cell")}>
              Roles
            </th>
            <th scope="col" className={cn(tabla.th, "hidden sm:table-cell")}>
              Estado
            </th>
            <th scope="col" className={cn(tabla.th, "hidden lg:table-cell")}>
              Último ingreso
            </th>
          </tr>
        </thead>
        <tbody className={tabla.cuerpo}>
          {items.map((u) => (
            <tr key={u.id} className={tabla.fila}>
              <td className={tabla.td}>
                <Link
                  href={`/admin/usuarios/${u.id}`}
                  className="font-bold text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {u.displayName ?? "Sin nombre"}
                </Link>
                <p className="text-xs break-all text-muted-foreground">{u.email ?? "Sin correo"}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs sm:hidden">
                  <EstadoUsuario status={u.status} />
                  <span className="text-muted-foreground">{u.roles.map(etiquetaRol).join(", ")}</span>
                </p>
              </td>
              <td className={cn(tabla.td, "hidden text-muted-foreground md:table-cell")}>
                {u.roles.map(etiquetaRol).join(", ") || "—"}
              </td>
              <td className={cn(tabla.td, "hidden sm:table-cell")}>
                <EstadoUsuario status={u.status} />
              </td>
              <td className={cn(tabla.td, "hidden whitespace-nowrap text-muted-foreground tabular-nums lg:table-cell")}>
                {formatearFechaHora(u.lastLoginAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
