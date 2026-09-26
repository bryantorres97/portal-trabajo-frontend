import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { Avatar, fotoTrabajador } from "@/components/site/WorkerCard";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { listConversations } from "@/server/chat/chat";
import { getPublicWorker } from "@/server/search/workers";

import { iniciarConversacion } from "./actions";
import { NuevoMensajeForm } from "./NuevoMensajeForm";

export const metadata: Metadata = { title: "Escribir a un trabajador" };

export default async function NuevaConversacionPage({ searchParams }: PageProps<"/mensajes/nuevo">) {
  const { trabajador } = await searchParams;
  const workerId = typeof trabajador === "string" ? trabajador : "";
  const auth = await requireConsentedPageAuth(`/mensajes/nuevo?trabajador=${encodeURIComponent(workerId)}`);
  if (auth.source === "ENTRA") redirect("/admin");

  // Si ya existe la conversación, se continúa allí.
  const existente = (await listConversations(auth.user)).find((c) => c.myRole === "CLIENTE" && c.workerId === workerId);
  if (existente) redirect(`/mensajes/${existente.id}`);

  const w = await getPublicWorker(workerId);
  if (!w) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Mensajes"
        titulo={`Escribe a ${w.displayName}`}
        descripcion="Cuéntale qué necesitas: el trabajo, la zona y cuándo lo necesitas. Así podrá responderte mejor."
      />
      <Section>
        <div className="max-w-2xl space-y-4 tarjeta p-5">
          <div className="flex items-center gap-3">
            <Avatar
              nombre={w.displayName}
              foto={w.hasPhoto ? fotoTrabajador(w.id) : null}
              className="h-14 w-14 text-lg"
            />
            <div>
              <p className="font-bold">{w.displayName}</p>
              <p className="text-sm text-muted-foreground">{w.services.map((s) => s.name).join(" · ")}</p>
            </div>
          </div>
          <NuevoMensajeForm action={iniciarConversacion} workerId={w.id} />
          <p className="flex gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-verde" aria-hidden />
            No compartas contraseñas ni datos bancarios. Acuerda precio y condiciones dentro de la plataforma.
          </p>
        </div>
      </Section>
    </>
  );
}
