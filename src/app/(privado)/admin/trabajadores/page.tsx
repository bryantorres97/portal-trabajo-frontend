import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Plus, Search } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { Section } from "@/components/site/SiteShell";
import { formatearFecha } from "@/lib/formatos";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { ETIQUETAS_ESTADO, WORKER_STATUSES } from "@/server/domain/workers/state-machine";
import { searchWorkersAdmin } from "@/server/workers/admin";

export const metadata: Metadata = { title: "Trabajadores · Panel GAD" };

const campo =
  "min-h-11 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

export default async function TrabajadoresPage({ searchParams }: PageProps<"/admin/trabajadores">) {
  const actor = await requirePagePermission("worker.read", "/admin/trabajadores");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const estado =
    typeof sp.estado === "string" && (WORKER_STATUSES as readonly string[]).includes(sp.estado) ? sp.estado : undefined;
  const pagina = typeof sp.page === "string" ? Math.min(Math.max(Math.trunc(Number(sp.page)) || 1, 1), 1000) : 1;
  const { items, total, page, pageSize } = await searchWorkersAdmin(actor, { q, status: estado, page: pagina });
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const privado = hasPermission(actor, "worker.read.private");
  const enlace = (p: number) =>
    `/admin/trabajadores?${new URLSearchParams({ ...(q ? { q } : {}), ...(estado ? { estado } : {}), page: String(p) })}`;

  return (
    <>
      <AdminHeader
        migas={[{ label: "Trabajadores" }]}
        titulo="Trabajadores"
        descripcion="Registro presencial, documentos, capacitación y habilitación de trabajadores de oficio."
      />
      <Section>
        <div className="flex flex-wrap items-end gap-2">
          <form role="search" className="flex flex-1 flex-wrap gap-2" action="/admin/trabajadores">
            <label className="flex min-w-60 flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">
                {privado ? "Buscar por nombre, celular o correo" : "Buscar por nombre público"}
              </span>
              <input
                type="search"
                name="q"
                defaultValue={q}
                maxLength={120}
                placeholder={privado ? "Nombre, celular o correo" : "Nombre público"}
                className="min-h-11 w-full bg-transparent text-sm outline-none"
              />
            </label>
            <label className="sr-only" htmlFor="estado">
              Estado
            </label>
            <select id="estado" name="estado" defaultValue={estado ?? ""} className={campo}>
              <option value="">Todos los estados</option>
              {WORKER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETAS_ESTADO[s]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              Buscar
            </button>
          </form>
          {hasPermission(actor, "worker.create") && (
            <Link
              href="/admin/trabajadores/nuevo"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary px-4 text-sm font-bold text-primary"
            >
              <Plus className="h-4 w-4" aria-hidden /> Registrar trabajador
            </Link>
          )}
        </div>

        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          {total === 0 ? "No hay trabajadores que coincidan." : `${total} trabajador${total === 1 ? "" : "es"}`}
        </p>

        {items.length > 0 && (
          <div className="mt-3 overflow-x-auto tarjeta">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Trabajador
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Oficios
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Desde
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/trabajadores/${w.id}`} className="font-bold text-primary hover:underline">
                        {w.displayName}
                      </Link>
                      {w.legalName && (
                        <p className="text-xs text-muted-foreground">
                          {w.legalName}
                          {w.phone ? ` · ${w.phone}` : ""}
                        </p>
                      )}
                      <p className="mt-1 flex flex-wrap gap-2 text-xs">
                        {w.linked && (
                          <span className="inline-flex items-center gap-1 font-semibold text-verde-fuerte">
                            <Link2 className="h-3 w-3" aria-hidden /> Cuenta vinculada
                          </span>
                        )}
                        {w.pendingReview && <span className="font-semibold text-naranja">Perfil por revisar</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">{w.services.join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      <EstadoTrabajador status={w.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatearFecha(w.statusChangedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {paginas > 1 && (
          <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={enlace(page - 1)} className="font-bold text-primary">
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Página {page} de {paginas}
            </span>
            {page < paginas ? (
              <Link href={enlace(page + 1)} className="font-bold text-primary">
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
