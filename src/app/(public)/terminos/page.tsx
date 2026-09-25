import type { Metadata } from "next";
import { connection } from "next/server";
import { Info } from "lucide-react";

import { Markdown } from "@/components/site/Markdown";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { logger } from "@/lib/logger";
import { getLegalDocument, type LegalDocument } from "@/server/users/consents";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Términos y condiciones de uso de Acolita.App, plataforma municipal de intermediación laboral.",
};

/** Muestra la versión vigente de TERMINOS (la misma que el usuario acepta en /cuenta/consentimiento). */
export default async function TerminosPage() {
  await connection(); // Siempre la versión vigente; no se pre-renderiza en el build.
  let doc: LegalDocument | null = null;
  try {
    doc = await getLegalDocument("TERMINOS");
  } catch (error) {
    logger.error("terminos.load_failed", { error });
  }

  return (
    <>
      <PageHeader
        eyebrow="Documentos legales"
        titulo="Términos y condiciones"
        descripcion="Reglas de uso de la plataforma para ciudadanos y trabajadores."
      />
      <Section>
        {doc ? (
          <article className="tarjeta p-5">
            <p className="mb-4 text-xs text-muted-foreground">Versión {doc.version}</p>
            <Markdown source={doc.contentMd} />
          </article>
        ) : (
          <p className="flex gap-3 rounded-2xl border border-azul/40 bg-azul/5 p-4 text-sm">
            <Info className="h-5 w-5 shrink-0 text-azul" aria-hidden />
            Los términos y condiciones no están disponibles en este momento. Inténtalo más tarde.
          </p>
        )}
      </Section>
    </>
  );
}
