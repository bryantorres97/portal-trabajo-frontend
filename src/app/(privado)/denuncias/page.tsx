import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ShieldCheck } from "lucide-react";

import { EstadoDenuncia } from "@/components/reports/EstadoDenuncia";
import { formatearFecha, formatearMomento } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { listMyReports } from "@/server/reports/reports";

export const metadata: Metadata = { title: "Mis denuncias" };

/** Seguimiento de las denuncias hechas por la persona (perfiles, mensajes, reseñas, conversaciones, disputas). */
export default async function DenunciasPage() {
  const auth = await requireConsentedPageAuth("/denuncias");
  if (auth.source === "ENTRA") redirect("/admin");
  const items = await listMyReports(auth.user);

  return (
    <div className="px-4 pt-8 pb-10 sm:px-6 lg:pt-12">
      <header>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Mis denuncias</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          El personal del GAD revisa cada denuncia. Aquí ves en qué estado está y respondes si te piden más información.
          La otra persona no sabe quién la denunció.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-12 text-center">
          <ShieldCheck className="h-12 w-12 text-verde-fuerte/70" aria-hidden />
          <p className="mt-4 text-lg font-bold">No has hecho denuncias</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Si algo no está bien, puedes denunciar un perfil, un mensaje, una reseña o una conversación desde donde lo
            veas.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/denuncias/${r.id}`}
                className={cn(
                  "group flex items-center gap-4 panel rounded-3xl p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevada)] sm:p-5",
                  r.needsInfo && "ring-2 ring-naranja/60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoDenuncia status={r.status} />
                    {r.needsInfo && (
                      <span className="rounded-full bg-naranja px-2.5 py-0.5 text-xs font-bold text-white">
                        Responde al GAD
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-lg font-extrabold">{r.targetLabel}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.reasonLabel} · {formatearFecha(r.createdAt)}
                  </p>
                  <p className="mt-1 text-sm">{r.publicMessage}</p>
                </div>
                <span className="hidden text-sm text-muted-foreground sm:block">{formatearMomento(r.updatedAt)}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
