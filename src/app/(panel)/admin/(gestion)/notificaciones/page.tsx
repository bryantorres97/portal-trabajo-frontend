import type { Metadata } from "next";
import { BellRing } from "lucide-react";

import { AdminHeader, Bloque, Insignia, tabla } from "@/components/admin/AdminHeader";
import { ActionForm } from "@/components/forms/ActionForm";
import { Paginacion } from "@/components/site/Paginacion";
import { isFcmConfigured, isPushSchedulerEnabled } from "@/lib/env";
import { formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import {
  ETIQUETAS_ESTADO_CAMPANA,
  ETIQUETAS_PLATAFORMA,
  ETIQUETAS_SEGMENTO,
  type EstadoCampana,
} from "@/server/domain/notifications/schemas";
import { listCampaigns, type Campana } from "@/server/notifications/campaigns";

import { cancelarAviso, procesarPendientes } from "./actions";
import { NuevoAviso } from "./NuevoAviso";

export const metadata: Metadata = { title: "Notificaciones · Panel GAD" };

const POR_PAGINA = 15;

const ESTILO_ESTADO: Record<EstadoCampana, string> = {
  PROGRAMADA: "bg-amarillo/25 [--punto:var(--naranja)]",
  ENVIANDO: "bg-primary/10 text-primary [--punto:var(--primary)]",
  COMPLETADA: "bg-verde/20 [--punto:var(--verde-fuerte)]",
  CANCELADA: "bg-muted text-muted-foreground",
};

/** Avisos push del GAD: redacción, destinatarios, programación e historial (notifications.broadcast). */
export default async function NotificacionesPage({ searchParams }: PageProps<"/admin/notificaciones">) {
  const actor = await requirePagePermission("notifications.broadcast", "/admin/notificaciones");
  const { page } = await searchParams;
  const pagina = Math.max(1, Number.parseInt(typeof page === "string" ? page : "1", 10) || 1);
  const { items, total } = await listCampaigns(actor, { limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA });
  const fcmListo = isFcmConfigured();

  return (
    <>
      <AdminHeader
        titulo="Notificaciones"
        descripcion="Avisos push a la app y a los navegadores: a todos, por grupo o a personas elegidas. Cada envío queda en la auditoría."
      />

      <div className="space-y-6">
        <Bloque titulo="Nuevo aviso">
          <NuevoAviso fcmListo={fcmListo} programables={isPushSchedulerEnabled()} />
        </Bloque>

        <section aria-labelledby="historial" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="historial" className="text-lg font-extrabold">
              Avisos enviados y programados
            </h2>
            {fcmListo && (
              <ActionForm
                action={procesarPendientes}
                submitLabel="Procesar envíos pendientes"
                pendingLabel="Enviando…"
                variant="secondary"
                tamano="sm"
                className="flex flex-wrap items-center gap-3 space-y-0"
              >
                {null}
              </ActionForm>
            )}
          </div>

          {items.length === 0 ? (
            <div className="grid place-items-center tarjeta px-6 py-14 text-center">
              <BellRing className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-bold">Todavía no hay avisos</p>
              <p className="mt-1 text-sm text-muted-foreground">Los avisos que crees aparecerán aquí con su avance.</p>
            </div>
          ) : (
            <div className={cn(tabla.marco, "overflow-x-auto")}>
              <table className={tabla.tabla}>
                <thead className={tabla.encabezado}>
                  <tr>
                    {["Aviso", "Para", "Envío", "Estado", "Resultado", ""].map((h, i) => (
                      <th key={i} scope="col" className={cn(tabla.th, "whitespace-nowrap")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={tabla.cuerpo}>
                  {items.map((c) => (
                    <FilaAviso key={c.id} c={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Paginacion
            actual={pagina}
            total={Math.ceil(total / POR_PAGINA)}
            enlace={(p) => `/admin/notificaciones?page=${p}`}
          />
        </section>
      </div>
    </>
  );
}

function FilaAviso({ c }: { c: Campana }) {
  const destino =
    c.segment === "SELECCION"
      ? [
          c.targetUsers && `${c.targetUsers} ${c.targetUsers === 1 ? "persona" : "personas"}`,
          c.targetDevices && `${c.targetDevices} ${c.targetDevices === 1 ? "dispositivo" : "dispositivos"}`,
        ]
          .filter(Boolean)
          .join(" y ")
      : ETIQUETAS_SEGMENTO[c.segment].titulo;
  const iniciado = c.status === "ENVIANDO" || c.status === "COMPLETADA" || !!c.startedAt;

  return (
    <tr className={tabla.fila}>
      <td className={cn(tabla.td, "min-w-64")}>
        <p className="font-bold">{c.title}</p>
        <p className="line-clamp-2 text-muted-foreground">{c.body}</p>
        {c.link && <p className="mt-0.5 text-xs text-muted-foreground">Abre {c.link}</p>}
      </td>
      <td className={cn(tabla.td, "min-w-40")}>
        <p>{destino}</p>
        <p className="text-xs text-muted-foreground">
          {c.platforms.map((p) => ETIQUETAS_PLATAFORMA[p]).join(", ")}
          {c.alsoInApp && " · también en la bandeja"}
        </p>
      </td>
      <td className={cn(tabla.td, "whitespace-nowrap")}>
        <p className="tabular-nums">{formatearFechaHora(c.startedAt ?? c.scheduledAt)}</p>
        <p className="text-xs text-muted-foreground">{c.createdByName ?? "—"}</p>
      </td>
      <td className={tabla.td}>
        <Insignia className={ESTILO_ESTADO[c.status]}>{ETIQUETAS_ESTADO_CAMPANA[c.status]}</Insignia>
      </td>
      <td className={cn(tabla.td, "whitespace-nowrap tabular-nums")}>
        {iniciado ? (
          <>
            <p>
              <strong>{c.sent}</strong> de {c.totalDevices} entregados
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                c.failed > 0 && `${c.failed} fallidos`,
                c.discarded > 0 && `${c.discarded} descartados`,
                c.alsoInApp && `${c.inAppUsers} en la bandeja`,
              ]
                .filter(Boolean)
                .join(" · ") || " "}
            </p>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={cn(tabla.td, "text-right")}>
        {(c.status === "PROGRAMADA" || c.status === "ENVIANDO") && (
          <ActionForm
            action={cancelarAviso}
            submitLabel="Cancelar"
            pendingLabel="…"
            variant="secondary"
            tamano="sm"
            className="space-y-2"
          >
            <input type="hidden" name="id" value={c.id} />
          </ActionForm>
        )}
      </td>
    </tr>
  );
}
