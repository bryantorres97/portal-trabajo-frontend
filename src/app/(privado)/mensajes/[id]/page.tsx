import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ChatThread } from "@/components/chat/ChatThread";
import { fotoTrabajador } from "@/components/site/WorkerCard";
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
  const esCliente = c.myRole === "CLIENTE";

  return (
    <ChatThread
      // Una conversación distinta monta un hilo nuevo (estado, desplazamiento y suscripción propios).
      key={c.id}
      conversationId={c.id}
      currentUserId={auth.user.id}
      counterpartName={c.counterpartName}
      counterpartPhoto={esCliente && c.workerHasPhoto ? fotoTrabajador(c.workerId) : null}
      profileHref={esCliente ? `/trabajadores/${c.workerId}` : null}
      initialMessages={historial.items}
      initialHasMore={historial.hasMore}
      initialOtherLastReadId={c.otherLastReadId}
      unreadAtOpen={c.unread}
      blockedByMe={c.blockedByMe}
      blockedByOther={c.blockedByOther}
      closed={c.status === "CERRADA"}
      workerLinked={c.workerLinked}
      myRole={c.myRole}
      reasons={motivos}
    />
  );
}
