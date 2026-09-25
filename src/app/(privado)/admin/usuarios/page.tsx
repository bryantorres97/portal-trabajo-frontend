import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { AdminHeader, EstadoUsuario } from "@/components/admin/AdminHeader";
import { Section } from "@/components/site/SiteShell";
import { etiquetaRol, formatearFechaHora } from "@/lib/formatos";
import { requirePagePermission } from "@/server/auth/current-user";
import { searchUsers } from "@/server/users/admin";

export const metadata: Metadata = { title: "Usuarios · Panel GAD" };

export default async function UsuariosPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const actor = await requirePagePermission("user.read", "/admin/usuarios");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = typeof sp.page === "string" ? sp.page : undefined;
  const { items, total, page: actual, pageSize } = await searchUsers(actor, { q, page: page ? Number(page) : 1 });
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const enlace = (p: number) => `/admin/usuarios?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <AdminHeader
        migas={[{ label: "Usuarios" }]}
        titulo="Usuarios"
        descripcion="Consulta cuentas del portal, asigna roles internos y bloquea cuentas cuando corresponda."
      />
      <Section>
        <form role="search" className="flex gap-2" action="/admin/usuarios">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscar por nombre o correo</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={120}
              placeholder="Nombre o correo"
              className="min-h-11 w-full bg-transparent text-sm outline-none"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            Buscar
          </button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          {total === 0 ? "No hay usuarios que coincidan." : `${total} usuario${total === 1 ? "" : "s"}`}
        </p>

        {items.length > 0 && (
          <div className="mt-3 overflow-x-auto tarjeta">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Usuario
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Roles
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Último ingreso
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/usuarios/${u.id}`} className="font-bold text-primary hover:underline">
                        {u.displayName ?? "Sin nombre"}
                      </Link>
                      <p className="text-xs text-muted-foreground">{u.email ?? "sin correo"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{u.roles.map(etiquetaRol).join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      <EstadoUsuario status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatearFechaHora(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {paginas > 1 && (
          <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm">
            {actual > 1 ? (
              <Link href={enlace(actual - 1)} className="font-bold text-primary">
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Página {actual} de {paginas}
            </span>
            {actual < paginas ? (
              <Link href={enlace(actual + 1)} className="font-bold text-primary">
                Siguiente →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Section>
    </>
  );
}
