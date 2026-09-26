import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ChatThread } from "@/components/chat/ChatThread";
import { Section } from "@/components/site/SiteShell";
import { Avatar, fotoTrabajador } from "@/components/site/WorkerCard";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { getConversation, listMessageReportReasons, listMessages } from "@/server/chat/chat";
import { DomainError } from "@/server/errors";

export const metadata: Metadata = { title: "Conversación" };

export default async function ConversacionPage({ params }: PageProps<"/mensajes/[id]">) {
  const { id } = await params;
  const auth = await requireConsentedPageAuth(`/mensajes/${id}`);
  if (auth.source === "ENTRA") redirect("/admin");

  const noEncontrada = (e: unknown): never => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  };
  const [c, historial, motivos] = await Promise.all([
    getConversation(auth.user, id).catch(noEncontrada),
    listMessages(auth.user, id).catch(noEncontrada),
    listMessageReportReasons(),
  ]);

  return (
    <Section>
      <div className="mb-3 flex items-center gap-3">
        <Link
          href="/mensajes"
          aria-label="Volver a mensajes"
          className="grid h-11 w-11 place-items-center rounded-xl border border-border"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <Avatar
          nombre={c.counterpartName}
          foto={c.myRole === "CLIENTE" && c.workerHasPhoto ? fotoTrabajador(c.workerId) : null}
          className="h-11 w-11 text-sm"
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{c.counterpartName}</h1>
          {c.myRole === "CLIENTE" ? (
            <Link href={`/trabajadores/${c.workerId}`} className="text-xs font-bold text-primary">
              Ver perfil del trabajador
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">Cliente</p>
          )}
        </div>
      </div>
      <ChatThread
        conversationId={c.id}
        currentUserId={auth.user.id}
        counterpartName={c.counterpartName}
        initialMessages={historial.items}
        initialHasMore={historial.hasMore}
        initialOtherLastReadId={c.otherLastReadId}
        blockedByMe={c.blockedByMe}
        blockedByOther={c.blockedByOther}
        closed={c.status === "CERRADA"}
        workerLinked={c.workerLinked}
        myRole={c.myRole}
        reasons={motivos}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        No compartas contraseñas ni datos bancarios. El GAD solo revisa una conversación si se presenta una denuncia.
      </p>
    </Section>
  );
}
