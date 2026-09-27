import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChevronDown, FileCheck2, ShieldCheck } from "lucide-react";

import { ActionForm } from "@/components/forms/ActionForm";
import { Markdown } from "@/components/site/Markdown";
import { requirePageAuth } from "@/server/auth/current-user";
import { safeReturnTo } from "@/server/http/request-info";
import { getPendingConsents } from "@/server/users/consents";

import { aceptarConsentimiento } from "../actions";

export const metadata: Metadata = { title: "Términos y privacidad" };

/** Lo esencial en lenguaje sencillo; el texto completo sigue disponible y es lo que se acepta. */
const enResumen = [
  "El portal es del GAD Municipalidad de Ambato y conecta a ciudadanos con trabajadores habilitados.",
  "Todo contacto se hace por el chat del portal: no se comparten teléfonos.",
  "Tus datos se usan para el servicio y la seguridad de la plataforma, según la ley de protección de datos.",
  "El GAD solo revisa una conversación si alguien la denuncia, y cada revisión queda registrada.",
];

/** Aceptación obligatoria de las versiones vigentes de los documentos legales (RN-18). */
export default async function ConsentimientoPage({ searchParams }: PageProps<"/cuenta/consentimiento">) {
  const { returnTo } = await searchParams;
  const destino = safeReturnTo(typeof returnTo === "string" ? returnTo : undefined, "/cuenta");
  const { user } = await requirePageAuth(`/cuenta/consentimiento?returnTo=${encodeURIComponent(destino)}`);
  const pendientes = await getPendingConsents(user.id);
  if (pendientes.length === 0) redirect(destino);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-6 sm:px-6 lg:pt-14">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <ShieldCheck className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-3xl leading-tight font-extrabold sm:text-4xl">Antes de empezar</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Para usar tu cuenta necesitamos que leas y aceptes la versión vigente de estos documentos.
      </p>

      <section aria-labelledby="titulo-resumen" className="mt-8 rounded-3xl superficie p-6">
        <h2 id="titulo-resumen" className="text-lg font-extrabold">
          En resumen
        </h2>
        <ul className="mt-3 space-y-2.5">
          {enResumen.map((t) => (
            <li key={t} className="flex gap-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-verde" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 space-y-3">
        {pendientes.map((doc) => (
          <details key={doc.code} className="group panel">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
              <FileCheck2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{doc.title}</span>
                <span className="text-sm text-muted-foreground">Versión {doc.version} · toca para leer completo</span>
              </span>
              <ChevronDown
                className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="max-h-96 overflow-y-auto border-t border-border/70 px-5 py-4 leading-relaxed" tabIndex={0}>
              <Markdown source={doc.contentMd} />
            </div>
          </details>
        ))}
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-6 rounded-3xl bg-card p-5 shadow-[var(--shadow-elevada)] ring-1 ring-border md:bottom-4">
        <ActionForm action={aceptarConsentimiento} submitLabel="Aceptar y continuar" pendingLabel="Registrando…">
          <input type="hidden" name="returnTo" value={destino} />
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="acepto" required className="mt-0.5 h-6 w-6 shrink-0 accent-primary" />
            <span>Leí y acepto los documentos. Entiendo que mi aceptación queda registrada con fecha y hora.</span>
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
