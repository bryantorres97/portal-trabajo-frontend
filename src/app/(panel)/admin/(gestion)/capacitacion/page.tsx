import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronRight, Plus } from "lucide-react";

import { AdminHeader, Bloque, Insignia } from "@/components/admin/AdminHeader";
import { EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { formatearFecha } from "@/lib/formatos";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { listTrainings, trainingQueue } from "@/server/workers/training";

import { guardarCurso } from "../trabajadores/actions";
import { TrainingForm } from "./TrainingForm";

export const metadata: Metadata = { title: "Capacitación · Panel GAD" };

export default async function CapacitacionPage() {
  const actor = await requirePagePermission("admin.access", "/admin/capacitacion");
  const gestiona = hasPermission(actor, "training.manage");
  const registra = hasPermission(actor, "training.record");
  if (!gestiona && !registra) redirect("/admin?error=forbidden");

  const [cursos, cola] = await Promise.all([listTrainings(), registra ? trainingQueue(actor) : Promise.resolve([])]);

  return (
    <>
      <AdminHeader
        titulo="Capacitación"
        descripcion="Cursos que habilitan a los trabajadores y quienes están por capacitarse. El resultado se registra en la ficha de cada trabajador."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        {registra && (
          <Bloque
            titulo="Por capacitar"
            descripcion={
              cola.length === 0
                ? undefined
                : `${cola.length} trabajador${cola.length === 1 ? "" : "es"}, del que más espera al más reciente.`
            }
            cuerpo="pt-3 pb-2"
          >
            {cola.length === 0 ? (
              <p className="flex items-center gap-2 px-5 pb-3 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-verde-fuerte" aria-hidden />
                Nadie está esperando capacitación.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {cola.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/admin/trabajadores/${w.id}`}
                      className="group flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-secondary/50"
                    >
                      <span className="min-w-0 flex-1 font-bold">{w.displayName}</span>
                      <EstadoTrabajador status={w.status} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        desde {formatearFecha(w.statusChangedAt)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>
        )}

        <Bloque
          titulo="Cursos"
          descripcion="El proceso de capacitación está pendiente de definición del GAD (P-13). Por ahora hay un curso general obligatorio y sin vencimiento."
          className={registra ? "" : "lg:col-span-2"}
          cuerpo="p-3"
        >
          <ul className="space-y-1">
            {cursos.map((c) => (
              <li key={c.id}>
                <details className="group rounded-xl open:bg-secondary/40">
                  <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl px-3 py-3 hover:bg-secondary/50 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-bold">
                        {c.name}
                        {c.required && <Insignia className="bg-primary/10 text-primary">Obligatorio</Insignia>}
                        {!c.active && <Insignia className="bg-muted text-muted-foreground">Inactivo</Insignia>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {c.code} · {c.provider === "INTERNO" ? "GAD" : "Externo"} ·{" "}
                        {c.validityMonths ? `vigencia ${c.validityMonths} meses` : "sin vencimiento"}
                      </span>
                    </span>
                    {gestiona && (
                      <ChevronDown
                        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    )}
                  </summary>
                  {c.description && <p className="px-3 pb-3 text-sm text-muted-foreground">{c.description}</p>}
                  {gestiona && (
                    <div className="px-3 pb-4">
                      <TrainingForm action={guardarCurso} valores={c} pre={`c-${c.id}`} />
                    </div>
                  )}
                </details>
              </li>
            ))}
            {gestiona && (
              <li>
                <details className="group rounded-xl open:bg-secondary/40">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 font-bold text-primary hover:bg-secondary/50 [&::-webkit-details-marker]:hidden">
                    <Plus className="h-4 w-4" aria-hidden /> Nuevo curso
                  </summary>
                  <div className="px-3 pt-2 pb-4">
                    <TrainingForm action={guardarCurso} pre="nuevo" />
                  </div>
                </details>
              </li>
            )}
          </ul>
        </Bloque>
      </div>
    </>
  );
}
