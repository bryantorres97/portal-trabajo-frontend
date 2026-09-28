import type { Metadata } from "next";
import Link from "next/link";
import { Download, ScrollText } from "lucide-react";

import { AdminHeader, tabla } from "@/components/admin/AdminHeader";
import { FiltroPeriodo } from "@/components/admin/FiltroPeriodo";
import { Paginacion } from "@/components/site/Paginacion";
import { boton } from "@/components/ui/boton";
import { campoCompacto, etiqueta } from "@/components/ui/campo";
import { etiquetaRol, formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { parseRango } from "@/server/domain/panel/schemas";
import { AUDITORIA_POR_PAGINA, searchAudit, searchSensitiveAccess } from "@/server/panel/audit";

export const metadata: Metadata = { title: "Auditoría · Panel GAD" };

const texto = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : "");

/** Visor de auditoría (audit.read): acciones registradas y accesos a información confidencial. */
export default async function AuditoriaPage({ searchParams }: PageProps<"/admin/auditoria">) {
  const actor = await requirePagePermission("audit.read", "/admin/auditoria");
  const sp = await searchParams;
  const vista = sp.ver === "accesos" ? "accesos" : "acciones";
  const rango = parseRango(sp);
  const pagina = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const filtros = { accion: texto(sp.accion), actor: texto(sp.actor), recurso: texto(sp.recurso) };
  const conservar = { ver: vista, ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) };
  const parametros = { ...conservar, desde: rango.desde, hasta: rango.hasta };

  const acciones = vista === "acciones" ? await searchAudit(actor, { ...rango, ...filtros }, pagina) : null;
  const accesos = vista === "accesos" ? await searchSensitiveAccess(actor, rango, pagina) : null;
  const total = acciones?.total ?? accesos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / AUDITORIA_POR_PAGINA));

  return (
    <>
      <AdminHeader
        titulo="Auditoría"
        descripcion="Registro inmutable de las acciones del sistema y de los accesos del personal a conversaciones y evidencia."
        acciones={
          vista === "acciones" &&
          hasPermission(actor, "data.export") &&
          total > 0 && (
            <a href={`/admin/auditoria/exportar?${new URLSearchParams(parametros)}`} className={boton()}>
              <Download aria-hidden /> Descargar CSV
            </a>
          )
        }
      />

      <nav aria-label="Registro" className="mb-4 inline-flex gap-1 rounded-2xl bg-secondary p-1">
        {[
          ["acciones", "Acciones"],
          ["accesos", "Accesos a información confidencial"],
        ].map(([v, t]) => (
          <Link
            key={v}
            href={`/admin/auditoria?${new URLSearchParams({ ver: v, desde: rango.desde, hasta: rango.hasta })}`}
            aria-current={vista === v ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-bold",
              vista === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </Link>
        ))}
      </nav>

      <FiltroPeriodo
        ruta="/admin/auditoria"
        desde={rango.desde}
        hasta={rango.hasta}
        periodo={rango.periodo}
        conservar={conservar}
      >
        {vista === "acciones" && (
          <>
            <div>
              <label htmlFor="accion" className={etiqueta}>
                Acción
              </label>
              <input
                id="accion"
                name="accion"
                defaultValue={filtros.accion}
                placeholder="p. ej. WORKER_"
                className={campoCompacto}
              />
            </div>
            <div>
              <label htmlFor="actor" className={etiqueta}>
                Persona
              </label>
              <input
                id="actor"
                name="actor"
                defaultValue={filtros.actor}
                placeholder="Nombre o correo"
                className={campoCompacto}
              />
            </div>
            <div>
              <label htmlFor="recurso" className={etiqueta}>
                Recurso
              </label>
              <input
                id="recurso"
                name="recurso"
                defaultValue={filtros.recurso}
                placeholder="p. ej. report"
                className={campoCompacto}
              />
            </div>
          </>
        )}
      </FiltroPeriodo>

      <p className="mt-5 mb-3 text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? "Sin registros para estos filtros." : `${total} registro${total === 1 ? "" : "s"}`}
      </p>

      {total === 0 ? (
        <div className="grid place-items-center tarjeta px-6 py-14 text-center">
          <ScrollText className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-bold">Nada registrado</p>
        </div>
      ) : acciones ? (
        <div className={cn(tabla.marco, "overflow-x-auto")}>
          <table className={tabla.tabla}>
            <thead className={tabla.encabezado}>
              <tr>
                <th scope="col" className={tabla.th}>
                  Fecha
                </th>
                <th scope="col" className={tabla.th}>
                  Acción
                </th>
                <th scope="col" className={tabla.th}>
                  Quién
                </th>
                <th scope="col" className={cn(tabla.th, "hidden md:table-cell")}>
                  Recurso
                </th>
                <th scope="col" className={cn(tabla.th, "hidden lg:table-cell")}>
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody className={tabla.cuerpo}>
              {acciones.items.map((r) => (
                <tr key={r.id} className={tabla.fila}>
                  <td className={cn(tabla.td, "whitespace-nowrap tabular-nums")}>{formatearFechaHora(r.occurredAt)}</td>
                  <td className={tabla.td}>
                    <span className="font-mono text-xs font-bold">{r.action}</span>
                    {r.result !== "SUCCESS" && (
                      <span className="ml-2 text-xs font-bold text-destructive">{r.result}</span>
                    )}
                  </td>
                  <td className={tabla.td}>
                    {r.actorName ?? "Sistema"}
                    {r.actorRoles.length > 0 && (
                      <p className="text-xs text-muted-foreground">{r.actorRoles.map(etiquetaRol).join(", ")}</p>
                    )}
                  </td>
                  <td className={cn(tabla.td, "hidden text-xs md:table-cell")}>
                    {r.resourceType ?? "—"}
                    {r.resourceId && <p className="font-mono break-all text-muted-foreground">{r.resourceId}</p>}
                  </td>
                  <td className={cn(tabla.td, "hidden lg:table-cell")}>
                    {Object.keys(r.metadata).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-xs font-bold text-primary">Ver</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded-lg bg-secondary p-2 text-[11px]">
                          {JSON.stringify(r.metadata, null, 2)}
                        </pre>
                        {r.ip && <p className="mt-1 text-[11px] text-muted-foreground">IP {r.ip}</p>}
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-3">
          {accesos!.items.map((a) => (
            <li key={a.id} className="tarjeta p-4 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <strong>{a.actorName ?? "Funcionario"}</strong>
                <span className="text-muted-foreground">{formatearFechaHora(a.occurredAt)}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">
                  {a.resourceType === "EVIDENCE_FILE" ? "Archivo de evidencia" : "Conversación y evidencia"}
                </span>
                <Link
                  href={`/admin/denuncias/${a.reportId}`}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Ver la denuncia
                </Link>
              </p>
              <p className="mt-1">{a.justification}</p>
            </li>
          ))}
        </ul>
      )}

      <Paginacion
        actual={pagina}
        total={paginas}
        enlace={(p) => `/admin/auditoria?${new URLSearchParams({ ...parametros, page: String(p) })}`}
      />
    </>
  );
}
