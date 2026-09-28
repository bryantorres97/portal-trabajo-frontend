import type { Metadata } from "next";
import Link from "next/link";
import { Plus, SearchX, X } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { BuscadorPanel } from "@/components/admin/BuscadorPanel";
import { Paginacion } from "@/components/site/Paginacion";
import { boton } from "@/components/ui/boton";
import { campoCompacto } from "@/components/ui/campo";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { ETIQUETAS_ESTADO, WORKER_STATUSES } from "@/server/domain/workers/state-machine";
import { searchWorkersAdmin } from "@/server/workers/admin";

import { TablaTrabajadores } from "./TablaTrabajadores";

export const metadata: Metadata = { title: "Trabajadores · Panel GAD" };

export default async function TrabajadoresPage({ searchParams }: PageProps<"/admin/trabajadores">) {
  const actor = await requirePagePermission("worker.read", "/admin/trabajadores");
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : undefined;
  const estado =
    typeof sp.estado === "string" && (WORKER_STATUSES as readonly string[]).includes(sp.estado) ? sp.estado : undefined;
  const revision = sp.revision === "1";
  const pagina = typeof sp.page === "string" ? Math.min(Math.max(Math.trunc(Number(sp.page)) || 1, 1), 1000) : 1;
  const { items, total, page, pageSize } = await searchWorkersAdmin(actor, {
    q,
    status: estado,
    pendingReview: revision,
    page: pagina,
  });
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const privado = hasPermission(actor, "worker.read.private");
  const filtrado = !!(q || estado || revision);
  const enlace = (p: number) =>
    `/admin/trabajadores?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(estado ? { estado } : {}),
      ...(revision ? { revision: "1" } : {}),
      page: String(p),
    })}`;

  return (
    <>
      <AdminHeader
        titulo="Trabajadores"
        descripcion="Registro presencial, documentos, capacitación y habilitación de trabajadores de oficio."
        acciones={
          hasPermission(actor, "worker.create") && (
            <Link href="/admin/trabajadores/nuevo" className={boton()}>
              <Plus aria-hidden /> Registrar trabajador
            </Link>
          )
        }
      />

      <BuscadorPanel
        action="/admin/trabajadores"
        etiqueta={privado ? "Buscar por nombre, celular o correo" : "Buscar por nombre público"}
        placeholder={privado ? "Nombre, celular o correo" : "Nombre público"}
        q={q}
      >
        <label className="sr-only" htmlFor="estado">
          Estado
        </label>
        <select
          id="estado"
          name="estado"
          defaultValue={estado ?? ""}
          className={cn(campoCompacto, "mt-0 w-full sm:w-56")}
        >
          <option value="">Todos los estados</option>
          {WORKER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ETIQUETAS_ESTADO[s]}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm font-semibold whitespace-nowrap hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input
            type="checkbox"
            name="revision"
            value="1"
            defaultChecked={revision}
            className="h-4 w-4 accent-primary"
          />
          Con cambios por aprobar
        </label>
      </BuscadorPanel>

      <div className="mt-5 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total === 0
            ? "Ningún trabajador coincide."
            : `${total} trabajador${total === 1 ? "" : "es"}${filtrado ? " con estos filtros" : ""}`}
        </p>
        {filtrado && (
          <Link
            href="/admin/trabajadores"
            className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-primary hover:underline"
          >
            <X className="h-4 w-4" aria-hidden /> Quitar filtros
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="grid place-items-center tarjeta px-6 py-14 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-bold">{filtrado ? "Sin resultados" : "Aún no hay trabajadores registrados"}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {filtrado
              ? "Prueba con otro nombre o quita los filtros."
              : "Registra al primer trabajador cuando llegue al punto de atención."}
          </p>
        </div>
      ) : (
        <TablaTrabajadores items={items} />
      )}

      <Paginacion actual={page} total={paginas} enlace={enlace} />
    </>
  );
}
