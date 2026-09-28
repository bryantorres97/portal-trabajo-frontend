import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, MessageSquareText } from "lucide-react";

import { EstadoDenuncia } from "@/components/reports/EstadoDenuncia";
import { AportarDenuncia } from "@/components/reports/SeguimientoDenuncia";
import { formatearFechaHora } from "@/lib/formatos";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { ETIQUETAS_EVENTO } from "@/server/domain/reports/state-machine";
import { DomainError } from "@/server/errors";
import { getMyReport } from "@/server/reports/reports";

export const metadata: Metadata = { title: "Seguimiento de la denuncia" };

export default async function DenunciaPage({ params }: PageProps<"/denuncias/[id]">) {
  const { id } = await params;
  const auth = await requireConsentedPageAuth(`/denuncias/${id}`);
  if (auth.source === "ENTRA") redirect("/admin");
  const r = await getMyReport(auth.user, id).catch((e: unknown) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });

  return (
    <div className="px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
      <Link
        href="/denuncias"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Mis denuncias
      </Link>
      <header className="mt-2">
        <p className="text-sm font-bold text-muted-foreground">{r.reasonLabel}</p>
        <h1 className="mt-1 text-3xl leading-tight font-extrabold sm:text-4xl">{r.targetLabel}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EstadoDenuncia status={r.status} className="text-sm" />
        </div>
        <p className="mt-3 max-w-2xl text-lg">{r.publicMessage}</p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          {r.open && <AportarDenuncia reportId={r.id} pideInfo={r.needsInfo} />}

          <section aria-labelledby="historial-denuncia" className="panel p-5 sm:p-6">
            <h2 id="historial-denuncia" className="text-xl font-extrabold">
              Historial
            </h2>
            <ol className="mt-4 space-y-4 border-l-2 border-border pl-4">
              {[...r.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[1.4rem] h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                  <p className="text-sm font-bold">
                    {e.event === "INFO_SOLICITADA"
                      ? "El GAD pidió información"
                      : e.byMe
                        ? e.event === "CREADA"
                          ? "Enviaste la denuncia"
                          : "Tu aporte"
                        : (ETIQUETAS_EVENTO[e.event] ?? e.event)}
                  </p>
                  {e.note && <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{e.note}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatearFechaHora(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="tu-denuncia" className="panel p-5">
            <h2 id="tu-denuncia" className="flex items-center gap-2 text-lg font-extrabold">
              <MessageSquareText className="h-5 w-5 text-primary" aria-hidden /> Lo que contaste
            </h2>
            <p className="mt-3 text-sm break-words whitespace-pre-wrap">{r.description ?? "Sin descripción."}</p>
            <p className="mt-3 text-xs text-muted-foreground">Enviada el {formatearFechaHora(r.createdAt)}</p>
          </section>
          {r.evidence.length > 0 && (
            <section aria-labelledby="tus-aportes" className="panel p-5">
              <h2 id="tus-aportes" className="text-lg font-extrabold">
                Lo que aportaste
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {r.evidence.map((x) => (
                  <li key={x.id} className="flex gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 break-words">{x.kind === "FILE" ? x.name : x.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
