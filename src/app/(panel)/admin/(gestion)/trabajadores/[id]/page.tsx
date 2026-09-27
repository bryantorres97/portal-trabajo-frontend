import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requirePagePermission } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { currentRequestContext } from "@/server/http/request-info";
import { getWorkerDetail } from "@/server/workers/admin";
import { listDocumentTypes } from "@/server/workers/documents";
import { listTrainings } from "@/server/workers/training";

import { FichaTrabajador } from "./FichaTrabajador";

export const metadata: Metadata = { title: "Ficha del trabajador · Panel GAD" };

export default async function TrabajadorPage({ params, searchParams }: PageProps<"/admin/trabajadores/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePagePermission("worker.read", `/admin/trabajadores/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const w = await getWorkerDetail(actor, id, await currentRequestContext()).catch((e) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  const [tipos, cursos] = await Promise.all([listDocumentTypes(), listTrainings({ onlyActive: true })]);
  const aviso = sp.registrado === "1" ? "registrado" : sp.guardado === "1" ? "guardado" : undefined;

  return <FichaTrabajador w={w} actor={actor} tipos={tipos} cursos={cursos} aviso={aviso} />;
}
