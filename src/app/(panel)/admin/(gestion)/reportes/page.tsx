import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";

import { AdminHeader, tabla } from "@/components/admin/AdminHeader";
import { FiltroPeriodo } from "@/components/admin/FiltroPeriodo";
import { Paginacion } from "@/components/site/Paginacion";
import { boton } from "@/components/ui/boton";
import { campoCompacto, etiqueta } from "@/components/ui/campo";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { parseRango, TIPOS_REPORTE, type TipoReporte } from "@/server/domain/panel/schemas";
import { FILAS_POR_PAGINA, REPORTES, reportPage } from "@/server/panel/reports";

export const metadata: Metadata = { title: "Reportes · Panel GAD" };

/** Reportes filtrables por periodo y estado, con descarga CSV auditada (data.export). */
export default async function ReportesPage({ searchParams }: PageProps<"/admin/reportes">) {
  const actor = await requirePagePermission("metrics.read", "/admin/reportes");
  const sp = await searchParams;
  const tipo: TipoReporte = TIPOS_REPORTE.includes(sp.tipo as TipoReporte) ? (sp.tipo as TipoReporte) : "trabajadores";
  const def = REPORTES[tipo];
  const estado = typeof sp.estado === "string" && sp.estado in def.estados ? sp.estado : "";
  const rango = parseRango(sp);
  const pagina = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const { encabezados, filas, total } = await reportPage(actor, tipo, { ...rango, estado }, pagina);
  const parametros = { tipo, desde: rango.desde, hasta: rango.hasta, ...(estado ? { estado } : {}) };
  const paginas = Math.max(1, Math.ceil(total / FILAS_POR_PAGINA));

  return (
    <>
      <AdminHeader
        titulo="Reportes"
        descripcion="Consulta y descarga información del periodo. Sin datos personales de los ciudadanos; cada descarga queda registrada en la auditoría."
        acciones={
          hasPermission(actor, "data.export") &&
          total > 0 && (
            <a href={`/admin/reportes/exportar?${new URLSearchParams(parametros)}`} className={boton()}>
              <Download aria-hidden /> Descargar CSV
            </a>
          )
        }
      />

      <nav aria-label="Tipo de reporte" className="mb-4 inline-flex gap-1 rounded-2xl bg-secondary p-1">
        {TIPOS_REPORTE.map((t) => (
          <Link
            key={t}
            href={`/admin/reportes?${new URLSearchParams({ tipo: t, desde: rango.desde, hasta: rango.hasta })}`}
            aria-current={t === tipo ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-bold",
              t === tipo ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {REPORTES[t].titulo}
          </Link>
        ))}
      </nav>

      <FiltroPeriodo
        ruta="/admin/reportes"
        desde={rango.desde}
        hasta={rango.hasta}
        periodo={rango.periodo}
        conservar={{ tipo, ...(estado ? { estado } : {}) }}
      >
        <div>
          <label htmlFor="estado" className={etiqueta}>
            Estado
          </label>
          <select id="estado" name="estado" defaultValue={estado} className={campoCompacto}>
            <option value="">Todos</option>
            {Object.entries(def.estados).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </FiltroPeriodo>

      <p className="mt-5 mb-3 text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? "Sin registros en el periodo."
          : `${total} registro${total === 1 ? "" : "s"} · ${tipo === "trabajadores" ? "registrados" : "creados"} en el periodo`}
      </p>

      {filas.length === 0 ? (
        <div className="grid place-items-center tarjeta px-6 py-14 text-center">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-bold">Nada que mostrar</p>
          <p className="mt-1 text-sm text-muted-foreground">Prueba con un periodo más amplio u otro estado.</p>
        </div>
      ) : (
        <div className={cn(tabla.marco, "overflow-x-auto")}>
          <table className={tabla.tabla}>
            <thead className={tabla.encabezado}>
              <tr>
                {encabezados.map((h) => (
                  <th key={h} scope="col" className={cn(tabla.th, "whitespace-nowrap")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={tabla.cuerpo}>
              {filas.map((f, i) => (
                <tr key={i} className={tabla.fila}>
                  {f.map((c, j) => (
                    <td key={j} className={cn(tabla.td, "whitespace-nowrap tabular-nums")}>
                      {c == null || c === "" ? "—" : typeof c === "boolean" ? (c ? "Sí" : "No") : String(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion
        actual={pagina}
        total={paginas}
        enlace={(p) => `/admin/reportes?${new URLSearchParams({ ...parametros, page: String(p) })}`}
      />
    </>
  );
}
