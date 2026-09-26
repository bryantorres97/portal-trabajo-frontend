import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ban, MessageCircle } from "lucide-react";

import { InboxLive } from "@/components/chat/InboxLive";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { Avatar, fotoTrabajador } from "@/components/site/WorkerCard";
import { formatearFechaHora } from "@/lib/formatos";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { listConversations } from "@/server/chat/chat";

export const metadata: Metadata = { title: "Mensajes" };

export default async function MensajesPage() {
  const auth = await requireConsentedPageAuth("/mensajes");
  if (auth.source === "ENTRA") redirect("/admin");
  const conversaciones = await listConversations(auth.user);

  return (
    <>
      <InboxLive userId={auth.user.id} />
      <PageHeader
        eyebrow="Mi cuenta"
        titulo="Mensajes"
        descripcion="Tus conversaciones con trabajadores y clientes. Por seguridad, el contacto se hace solo por este chat."
      />
      <Section>
        {conversaciones.length === 0 ? (
          <div className="tarjeta p-6 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-primary" aria-hidden />
            <p className="mt-3 font-bold">Aún no tienes conversaciones</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Busca un trabajador y usa «Escribir por el chat» en su perfil.
            </p>
            <Link
              href="/buscar"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
            >
              Buscar trabajadores
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border tarjeta">
            {conversaciones.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/mensajes/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
                >
                  <Avatar
                    nombre={c.counterpartName}
                    foto={c.myRole === "CLIENTE" && c.workerHasPhoto ? fotoTrabajador(c.workerId) : null}
                    className="h-12 w-12 text-base"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center justify-between gap-2">
                      <span className={c.unread > 0 ? "truncate font-extrabold" : "truncate font-bold"}>
                        {c.counterpartName}
                        <span className="ml-2 text-xs font-semibold text-muted-foreground">
                          {c.myRole === "CLIENTE" ? "Trabajador" : "Cliente"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatearFechaHora(c.lastMessageAt ?? c.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        {c.status === "BLOQUEADA" && <Ban className="h-3.5 w-3.5 shrink-0" aria-label="Bloqueada" />}
                        <span className="truncate">
                          {c.lastSenderIsMe ? "Tú: " : ""}
                          {c.lastMessagePreview ?? "Sin mensajes"}
                        </span>
                      </span>
                      {c.unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                          {c.unread}
                          <span className="sr-only"> sin leer</span>
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
