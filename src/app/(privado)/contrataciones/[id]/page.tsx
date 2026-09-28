import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DetalleContrato } from "@/components/contracts/DetalleContrato";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { getContract, getContractFormOptions, listDisputeReasons } from "@/server/contracts/contracts";
import { DomainError } from "@/server/errors";
import { getClientReputation, getContractReviews } from "@/server/reviews/reviews";

export const metadata: Metadata = { title: "Contratación" };

export default async function ContratacionPage({ params }: PageProps<"/contrataciones/[id]">) {
  const { id } = await params;
  const auth = await requireConsentedPageAuth(`/contrataciones/${id}`);
  if (auth.source === "ENTRA") redirect("/admin");

  const contrato = await getContract(auth.user, id).catch((e: unknown) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  const [opciones, motivos, calificaciones, reputacion] = await Promise.all([
    getContractFormOptions(auth.user, contrato.conversationId),
    listDisputeReasons(),
    contrato.status === "FINALIZADA" ? getContractReviews(auth.user, contrato.id) : null,
    // RN-20: la reputación del cliente solo la ve el trabajador (la función devuelve null a los demás).
    contrato.myRole === "TRABAJADOR" ? getClientReputation(auth.user, contrato.conversationId) : null,
  ]);

  return (
    <DetalleContrato
      key={contrato.id}
      c={contrato}
      opciones={opciones}
      motivos={motivos}
      calificaciones={calificaciones}
      reputacion={reputacion}
    />
  );
}
