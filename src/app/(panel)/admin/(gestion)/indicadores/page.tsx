import type { Metadata } from "next";

import { AdminHeader, Bloque } from "@/components/admin/AdminHeader";
import { FiltroPeriodo } from "@/components/admin/FiltroPeriodo";
import { BarrasHorizontales, ColumnasSemanales, Indicador } from "@/components/admin/Graficos";
import { formatearFecha } from "@/lib/formatos";
import { requirePagePermission } from "@/server/auth/current-user";
import { ETIQUETAS_ESTADO as ESTADO_CONTRATO, type ContractStatus } from "@/server/domain/contracts/state-machine";
import { parseRango } from "@/server/domain/panel/schemas";
import { ETIQUETAS_OBJETIVO, type ReportTargetType } from "@/server/domain/reports/state-machine";
import { ETIQUETAS_ESTADO as ESTADO_TRABAJADOR, WORKER_STATUSES } from "@/server/domain/workers/state-machine";
import { getMetrics, weeklyActivity } from "@/server/panel/metrics";

export const metadata: Metadata = { title: "Indicadores · Panel GAD" };

const num = (n: number | null | undefined, sufijo = "") =>
  n == null ? "—" : `${Number(n).toLocaleString("es-EC", { maximumFractionDigits: 1 })}${sufijo}`;

/** Tablero de indicadores (metrics.read): lo que un supervisor necesita sin consultas SQL. */
export default async function IndicadoresPage({ searchParams }: PageProps<"/admin/indicadores">) {
  const actor = await requirePagePermission("metrics.read", "/admin/indicadores");
  const rango = parseRango(await searchParams);
  const [m, semanas] = await Promise.all([getMetrics(actor, rango.desde, rango.hasta), weeklyActivity(actor, 12)]);
  const serie = (k: "conversaciones" | "contrataciones" | "finalizadas" | "denuncias") =>
    semanas.map((s) => ({ etiqueta: formatearFecha(s.semana), valor: s[k] }));

  return (
    <>
      <AdminHeader
        titulo="Indicadores"
        descripcion={`Del ${formatearFecha(rango.desde)} al ${formatearFecha(rango.hasta)} (hora de Ecuador). Los estados actuales no dependen del periodo.`}
      />
      <FiltroPeriodo ruta="/admin/indicadores" desde={rango.desde} hasta={rango.hasta} periodo={rango.periodo} />

      <h2 className="mt-8 text-lg font-extrabold">En el periodo</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Indicador
          titulo="Trabajadores registrados"
          valor={num(m.workers.registered)}
          detalle={`${m.workers.enabled} habilitados`}
        />
        <Indicador
          titulo="Ciudadanos nuevos"
          valor={num(m.citizens.new)}
          detalle={`${num(m.citizens.total)} activos en total`}
        />
        <Indicador
          titulo="Conversaciones nuevas"
          valor={num(m.chat.conversationsNew)}
          detalle={`${num(m.chat.messages)} mensajes`}
        />
        <Indicador
          titulo="Contrataciones acordadas"
          valor={num(m.contracts.agreed)}
          detalle={`${num(m.contracts.proposed)} propuestas · conversión ${num(m.contracts.conversionPct, " %")}`}
        />
        <Indicador
          titulo="Trabajos finalizados"
          valor={num(m.contracts.completed)}
          detalle={`${num(m.reviews.count)} reseñas · promedio ${num(m.reviews.avgRating)} ★`}
        />
        <Indicador
          titulo="Denuncias recibidas"
          valor={num(m.reports.created)}
          detalle={`${num(m.reports.resolved)} cerradas · ${num(m.reports.sanctions)} sanciones`}
        />
      </div>

      <h2 className="mt-8 text-lg font-extrabold">Atención de denuncias</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador titulo="Abiertas ahora" valor={num(m.reports.open)} />
        <Indicador titulo="Con plazo vencido" valor={num(m.reports.overdue)} alerta={m.reports.overdue > 0} />
        <Indicador
          titulo="Tiempo medio de atención"
          valor={num(m.reports.avgResolutionHours, " h")}
          detalle="Cerradas en el periodo"
        />
        <Indicador
          titulo="Dentro del plazo"
          valor={num(m.reports.withinDeadlinePct, " %")}
          detalle="Cerradas en el periodo"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Bloque titulo="Trabajadores por estado" descripcion="Situación actual">
          <BarrasHorizontales
            titulo="Trabajadores por estado"
            datos={WORKER_STATUSES.map((s) => ({
              etiqueta: ESTADO_TRABAJADOR[s],
              valor: m.workers.byStatus[s] ?? 0,
            })).filter((d) => d.valor > 0)}
          />
          <p className="mt-3 text-xs text-muted-foreground">{m.workers.linked} activaron su cuenta en el portal.</p>
        </Bloque>
        <Bloque
          titulo="Habilitados por categoría"
          descripcion="Un trabajador puede ofrecer oficios de varias categorías"
        >
          <BarrasHorizontales
            titulo="Habilitados por categoría"
            datos={m.workers.enabledByCategory.map((c) => ({ etiqueta: c.category, valor: c.count }))}
          />
        </Bloque>
        <Bloque titulo="Contrataciones por estado" descripcion="Situación actual">
          <BarrasHorizontales
            titulo="Contrataciones por estado"
            datos={Object.entries(m.contracts.byStatus)
              .map(([s, n]) => ({ etiqueta: ESTADO_CONTRATO[s as ContractStatus] ?? s, valor: n }))
              .sort((a, b) => b.valor - a.valor)}
            vacio="Aún no hay contrataciones."
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Tiempo medio hasta el acuerdo: {num(m.contracts.avgHoursToAgreement, " h")} (acordadas en el periodo).
          </p>
        </Bloque>
        <Bloque titulo="Denuncias por tipo" descripcion="Recibidas en el periodo">
          <BarrasHorizontales
            titulo="Denuncias por tipo"
            datos={Object.entries(m.reports.byTargetType)
              .map(([t, n]) => ({ etiqueta: ETIQUETAS_OBJETIVO[t as ReportTargetType] ?? t, valor: n }))
              .sort((a, b) => b.valor - a.valor)}
            vacio="Sin denuncias en el periodo."
          />
        </Bloque>
      </div>

      <h2 className="mt-8 text-lg font-extrabold">Últimas 12 semanas</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ColumnasSemanales titulo="Conversaciones nuevas" datos={serie("conversaciones")} />
        <ColumnasSemanales titulo="Propuestas de contratación" datos={serie("contrataciones")} />
        <ColumnasSemanales titulo="Trabajos finalizados" datos={serie("finalizadas")} />
        <ColumnasSemanales titulo="Denuncias" datos={serie("denuncias")} />
      </div>
      <details className="mt-3 tarjeta p-4 text-sm">
        <summary className="min-h-10 cursor-pointer font-bold">Ver las 12 semanas como tabla</summary>
        <table className="mt-3 w-full tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3 font-bold">Semana del</th>
              <th className="py-1 pr-3 font-bold">Conversaciones</th>
              <th className="py-1 pr-3 font-bold">Propuestas</th>
              <th className="py-1 pr-3 font-bold">Finalizados</th>
              <th className="py-1 font-bold">Denuncias</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => (
              <tr key={s.semana} className="border-t border-border/60">
                <td className="py-1 pr-3">{formatearFecha(s.semana)}</td>
                <td className="py-1 pr-3">{s.conversaciones}</td>
                <td className="py-1 pr-3">{s.contrataciones}</td>
                <td className="py-1 pr-3">{s.finalizadas}</td>
                <td className="py-1">{s.denuncias}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
