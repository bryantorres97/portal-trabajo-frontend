import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";

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
    <section
      aria-labelledby="titulo-nuevo"
      className="flex h-full flex-col bg-card px-4 pt-4 pb-8 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:px-8 lg:pt-6 lg:shadow-[var(--shadow-tarjeta)]"
    >
      <Link
        href={`/trabajadores/${w.id}`}
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-bold text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al perfil
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <Avatar nombre={w.displayName} foto={w.hasPhoto ? fotoTrabajador(w.id) : null} className="h-16 w-16 text-xl" />
        <div className="min-w-0">
          <h1 id="titulo-nuevo" className="text-2xl leading-tight font-extrabold">
            Escribe a {w.displayName}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">{w.services.map((s) => s.name).join(" · ")}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-verde-fuerte">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Habilitado por el GAD Municipalidad de Ambato
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-2xl">
        <NuevoMensajeForm action={iniciarConversacion} workerId={w.id} />
        <p className="mt-6 flex gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5 shrink-0 text-verde-fuerte" aria-hidden />
          El contacto es solo por este chat: no se comparten teléfonos. No envíes contraseñas ni datos bancarios.
        </p>
      </div>
    </section>
  );
}
