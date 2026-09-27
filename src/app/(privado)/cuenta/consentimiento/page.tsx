import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileCheck2 } from "lucide-react";

import { ActionForm } from "@/components/forms/ActionForm";
import { Markdown } from "@/components/site/Markdown";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { requirePageAuth } from "@/server/auth/current-user";
import { safeReturnTo } from "@/server/http/request-info";
import { getPendingConsents } from "@/server/users/consents";

import { aceptarConsentimiento } from "../actions";

export const metadata: Metadata = { title: "Términos y privacidad" };

/** Aceptación obligatoria de las versiones vigentes de los documentos legales (RN-18). */
export default async function ConsentimientoPage({ searchParams }: PageProps<"/cuenta/consentimiento">) {
  const { returnTo } = await searchParams;
  const destino = safeReturnTo(typeof returnTo === "string" ? returnTo : undefined, "/cuenta");
  const { user } = await requirePageAuth(`/cuenta/consentimiento?returnTo=${encodeURIComponent(destino)}`);
  const pendientes = await getPendingConsents(user.id);
  if (pendientes.length === 0) redirect(destino);

  return (
    <>
      <PageHeader
        titulo="Términos y tratamiento de datos"
        descripcion="Para usar tu cuenta necesitamos que leas y aceptes la versión vigente de estos documentos."
      />
      <Section>
        <div className="space-y-4">
          {pendientes.map((doc) => (
            <article key={doc.code} className="tarjeta p-5" aria-labelledby={`doc-${doc.code}`}>
              <h2 id={`doc-${doc.code}`} className="flex items-center gap-2 text-lg font-extrabold">
                <FileCheck2 className="h-5 w-5 text-primary" aria-hidden />
                {doc.title}
              </h2>
              <p className="mt-1 mb-3 text-xs text-muted-foreground">Versión {doc.version}</p>
              <div className="max-h-72 overflow-y-auto rounded-xl bg-secondary/60 p-4" tabIndex={0}>
                <Markdown source={doc.contentMd} />
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section>
        <div className="tarjeta p-5">
          <ActionForm action={aceptarConsentimiento} submitLabel="Aceptar y continuar" pendingLabel="Registrando…">
            <input type="hidden" name="returnTo" value={destino} />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="acepto" required className="mt-1 h-5 w-5 shrink-0 accent-primary" />
              <span>
                Leí y acepto los documentos anteriores. Entiendo que mi aceptación queda registrada con fecha y hora.
              </span>
            </label>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
