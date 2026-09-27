import type { Metadata } from "next";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { requirePagePermission } from "@/server/auth/current-user";
import { getWorkerFormOptions } from "@/server/workers/admin";

import { registrarTrabajador } from "../actions";
import { WorkerWizard } from "../WorkerWizard";

export const metadata: Metadata = { title: "Registrar trabajador · Panel GAD" };

export default async function NuevoTrabajadorPage() {
  await requirePagePermission("worker.create", "/admin/trabajadores/nuevo");
  const opciones = await getWorkerFormOptions();

  return (
    <>
      <AdminHeader
        migas={[{ href: "/admin/trabajadores", label: "Trabajadores" }, { label: "Registrar" }]}
        titulo="Registrar trabajador"
        descripcion="Alta presencial en el punto de atención. Al final el sistema avisa si la persona podría estar ya registrada."
      />
      <div className="max-w-4xl">
        <WorkerWizard action={registrarTrabajador} opciones={opciones} cancelHref="/admin/trabajadores" />
      </div>
    </>
  );
}
