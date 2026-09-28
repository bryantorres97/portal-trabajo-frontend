import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ChatThread } from "@/components/chat/ChatThread";
import { fotoTrabajador } from "@/components/site/WorkerCard";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { getConversation, listMessageReportReasons, listMessages } from "@/server/chat/chat";
import { getContractFormOptions, listContracts } from "@/server/contracts/contracts";
import { listReportReasons } from "@/server/reports/reports";
import { getClientReputation } from "@/server/reviews/reviews";
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
  const [contratos, opcionesContrato, reputacionCliente, motivosConversacion, motivosCliente] = await Promise.all([
    listContracts(auth.user, { scope: "activas" }, c.id),
    c.workerLinked ? getContractFormOptions(auth.user, c.id) : null,
    // RN-20: solo el trabajador ve cómo calificaron otros trabajadores a este cliente.
    esCliente ? null : getClientReputation(auth.user, c.id),
    listReportReasons("CONVERSATION"),
    esCliente ? null : listReportReasons("CLIENT"),
  ]);

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
      contratos={contratos}
      opcionesContrato={opcionesContrato}
      puedeProponer={c.workerLinked && !contratos.some((k) => k.status === "PROPUESTA_ENVIADA")}
      reputacionCliente={reputacionCliente}
      motivosDenuncia={{ CONVERSATION: motivosConversacion, CLIENT: motivosCliente ?? undefined }}
    />
  );
}
