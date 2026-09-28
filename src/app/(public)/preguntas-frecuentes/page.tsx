import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronDown, HelpCircle } from "lucide-react";

import { JsonLd } from "@/components/site/JsonLd";
import { Markdown } from "@/components/site/Markdown";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { logger } from "@/lib/logger";
import { listPublicFaq, type PublicFaq } from "@/server/content/content";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Respuestas sobre cómo contratar trabajadores habilitados por el GAD de Ambato, cómo registrarse como trabajador, pagos, seguridad y denuncias.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

const GRUPOS: { audience: PublicFaq["audience"]; titulo: string }[] = [
  { audience: "GENERAL", titulo: "Sobre la plataforma" },
  { audience: "CLIENTES", titulo: "Para quien contrata" },
  { audience: "TRABAJADORES", titulo: "Para trabajadores" },
];

/** Preguntas frecuentes administrables desde el panel del GAD (Fase 9). */
export default async function PreguntasFrecuentesPage() {
  await connection();
  let preguntas: PublicFaq[] = [];
  try {
    preguntas = await listPublicFaq();
  } catch (error) {
    logger.error("faq.load_failed", { error });
  }

  return (
    <>
      {preguntas.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: preguntas.map((p) => ({
              "@type": "Question",
              name: p.question,
              acceptedAnswer: { "@type": "Answer", text: p.answerMd.replace(/\*\*/g, "") },
            })),
          }}
        />
      )}
      <PageHeader titulo="Preguntas frecuentes" descripcion="Lo que más nos consultan sobre Acolita.App." />
      {GRUPOS.map((g) => {
        const lista = preguntas.filter((p) => p.audience === g.audience);
        if (lista.length === 0) return null;
        return (
          <Section key={g.audience} titulo={g.titulo}>
            <div className="space-y-3">
              {lista.map((p) => (
                <details key={p.id} className="group tarjeta p-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-base font-bold">
                    <HelpCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="flex-1">{p.question}</span>
                    <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="mt-3 pl-8 text-muted-foreground">
                    <Markdown source={p.answerMd} />
                  </div>
                </details>
              ))}
            </div>
          </Section>
        );
      })}
      {preguntas.length === 0 && (
        <Section>
          <p className="text-muted-foreground">Pronto publicaremos las preguntas frecuentes.</p>
        </Section>
      )}
      <Section>
        <p className="text-sm text-muted-foreground">
          ¿No encontraste lo que buscabas?{" "}
          <Link href="/contacto" className="font-bold text-primary underline underline-offset-4">
            Escríbenos
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
