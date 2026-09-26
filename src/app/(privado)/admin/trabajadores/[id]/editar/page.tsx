import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { Section } from "@/components/site/SiteShell";
import { requirePagePermission } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { currentRequestContext } from "@/server/http/request-info";
import { getWorkerForEdit, getWorkerFormOptions } from "@/server/workers/admin";

import { guardarTrabajador } from "../../actions";
import { WorkerWizard } from "../../WorkerWizard";

export const metadata: Metadata = { title: "Editar trabajador · Panel GAD" };

export default async function EditarTrabajadorPage({ params }: PageProps<"/admin/trabajadores/[id]/editar">) {
  const { id } = await params;
  const actor = await requirePagePermission("worker.update", `/admin/trabajadores/${id}/editar`);
  if (!z.uuid().safeParse(id).success) notFound();
  if (!actor.permissions.includes("worker.read.private")) redirect(`/admin/trabajadores/${id}`);

  const [ficha, opciones] = await Promise.all([
    getWorkerForEdit(actor, id, await currentRequestContext()).catch((e) => {
      if (e instanceof DomainError && e.status === 404) notFound();
      if (e instanceof DomainError && e.status === 409) redirect(`/admin/trabajadores/${id}`);
      throw e;
    }),
    getWorkerFormOptions(),
  ]);

  return (
    <>
      <AdminHeader
        migas={[
          { href: "/admin/trabajadores", label: "Trabajadores" },
          { href: `/admin/trabajadores/${id}`, label: ficha.values.publicDisplayName },
          { label: "Editar" },
        ]}
        titulo="Editar datos del trabajador"
        descripcion="Los cambios quedan registrados en la auditoría."
      />
      <Section>
        <WorkerWizard
          action={guardarTrabajador}
          opciones={opciones}
          initial={ficha.values}
          workerId={id}
          cancelHref={`/admin/trabajadores/${id}`}
        />
      </Section>
    </>
  );
}
