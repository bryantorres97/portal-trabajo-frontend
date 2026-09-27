import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, X } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { BuscadorPanel } from "@/components/admin/BuscadorPanel";
import { Paginacion } from "@/components/site/Paginacion";
import { requirePagePermission } from "@/server/auth/current-user";
import { searchUsers } from "@/server/users/admin";

import { TablaUsuarios } from "./TablaUsuarios";

export const metadata: Metadata = { title: "Usuarios · Panel GAD" };

export default async function UsuariosPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const actor = await requirePagePermission("user.read", "/admin/usuarios");
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : undefined;
  const page = typeof sp.page === "string" ? sp.page : undefined;
  const { items, total, page: actual, pageSize } = await searchUsers(actor, { q, page: page ? Number(page) : 1 });
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const enlace = (p: number) => `/admin/usuarios?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <AdminHeader
        titulo="Usuarios"
        descripcion="Cuentas del portal: consulta sus datos, asigna roles internos al personal y bloquea cuentas cuando corresponda."
      />

      <BuscadorPanel
        action="/admin/usuarios"
        etiqueta="Buscar por nombre o correo"
        placeholder="Nombre o correo"
        q={q}
      />

      <div className="mt-5 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total === 0 ? "Ninguna cuenta coincide." : `${total} cuenta${total === 1 ? "" : "s"}`}
        </p>
        {q && (
          <Link
            href="/admin/usuarios"
            className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-primary hover:underline"
          >
            <X className="h-4 w-4" aria-hidden /> Quitar búsqueda
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="grid place-items-center tarjeta px-6 py-14 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-bold">Sin resultados</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Busca por una parte del nombre o del correo con el que la persona ingresó.
          </p>
        </div>
      ) : (
        <TablaUsuarios items={items} />
      )}

      <Paginacion actual={actual} total={paginas} enlace={enlace} />
    </>
  );
}
