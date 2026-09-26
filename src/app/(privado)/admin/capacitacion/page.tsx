import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { Section } from "@/components/site/SiteShell";
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
        migas={[{ label: "Capacitación" }]}
        titulo="Capacitación"
        descripcion="Cursos que habilitan a los trabajadores y seguimiento de quienes están por capacitarse. El resultado se registra en la ficha de cada trabajador."
      />

      {registra && (
        <Section titulo="Trabajadores por capacitar">
          {cola.length === 0 ? (
            <p className="tarjeta p-5 text-sm text-muted-foreground">No hay trabajadores pendientes de capacitación.</p>
          ) : (
            <ul className="divide-y divide-border tarjeta">
              {cola.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <Link href={`/admin/trabajadores/${w.id}`} className="font-bold text-primary hover:underline">
                    {w.displayName}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <EstadoTrabajador status={w.status} /> desde {formatearFecha(w.statusChangedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section titulo="Cursos">
        <div className="space-y-3">
          {cursos.map((c) => (
            <details key={c.id} className="tarjeta p-5">
              <summary className="cursor-pointer">
                <span className="font-bold">{c.name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {c.code} · {c.provider === "INTERNO" ? "GAD" : "Externo"}
                  {c.required ? " · obligatorio" : ""}
                  {c.validityMonths ? ` · vigencia ${c.validityMonths} meses` : " · sin vencimiento"}
                  {c.active ? "" : " · inactivo"}
                </span>
              </summary>
              {c.description && <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>}
              {gestiona && (
                <div className="mt-4">
                  <TrainingForm action={guardarCurso} valores={c} pre={`c-${c.id}`} />
                </div>
              )}
            </details>
          ))}
          {gestiona && (
            <details className="tarjeta p-5">
              <summary className="cursor-pointer font-bold">Nuevo curso</summary>
              <div className="mt-4">
                <TrainingForm action={guardarCurso} pre="nuevo" />
              </div>
            </details>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          El proceso de capacitación está pendiente de definición del GAD (P-13). Por ahora hay un curso general
          obligatorio y sin vencimiento.
        </p>
      </Section>
    </>
  );
}
