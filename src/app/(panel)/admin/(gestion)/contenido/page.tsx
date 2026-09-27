import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { AdminHeader, Bloque, Insignia } from "@/components/admin/AdminHeader";
import { Markdown } from "@/components/site/Markdown";
import { formatearFechaHora } from "@/lib/formatos";
import { requirePagePermission } from "@/server/auth/current-user";
import { listFaqForAdmin, listLegalForAdmin } from "@/server/content/content";
import { ETIQUETAS_AUDIENCIA } from "@/server/domain/panel/schemas";

import {
  DescartarBorrador,
  EliminarPregunta,
  FormularioBorradorLegal,
  FormularioPregunta,
  PublicarLegal,
} from "./FormulariosContenido";

export const metadata: Metadata = { title: "Contenido · Panel GAD" };

const DOCUMENTOS = [
  { code: "TERMINOS" as const, nombre: "Términos y condiciones", ruta: "/terminos" },
  { code: "PRIVACIDAD" as const, nombre: "Aviso de privacidad", ruta: "/privacidad" },
];

/** Preguntas frecuentes y documentos legales versionados (content.manage). */
export default async function ContenidoPage() {
  const actor = await requirePagePermission("content.manage", "/admin/contenido");
  const [preguntas, legales] = await Promise.all([listFaqForAdmin(actor), listLegalForAdmin(actor)]);

  return (
    <>
      <AdminHeader
        titulo="Contenido"
        descripcion="Preguntas frecuentes y documentos legales del portal. Cada cambio queda en la auditoría."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="faq" className="space-y-4">
          <h2 id="faq" className="flex items-center justify-between text-lg font-extrabold">
            Preguntas frecuentes
            <Link
              href="/preguntas-frecuentes"
              className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
            >
              Ver en el portal <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </h2>
          <Bloque titulo="Nueva pregunta">
            <FormularioPregunta />
          </Bloque>
          {preguntas.map((p) => (
            <details key={p.id} className="tarjeta p-4">
              <summary className="flex min-h-10 cursor-pointer flex-wrap items-center gap-2 font-bold">
                <span className="min-w-0 flex-1">{p.question}</span>
                <Insignia
                  className={
                    p.published ? "bg-verde/20 [--punto:var(--verde-fuerte)]" : "bg-muted text-muted-foreground"
                  }
                >
                  {p.published ? "Publicada" : "Borrador"}
                </Insignia>
                <span className="text-xs font-normal text-muted-foreground">{ETIQUETAS_AUDIENCIA[p.audience]}</span>
              </summary>
              <div className="mt-3">
                <FormularioPregunta p={p} />
                <EliminarPregunta id={p.id} />
              </div>
            </details>
          ))}
        </section>

        <section aria-labelledby="legales" className="space-y-4">
          <h2 id="legales" className="text-lg font-extrabold">
            Documentos legales
          </h2>
          <p className="text-sm text-muted-foreground">
            Las versiones publicadas no se modifican: las aceptaciones de cada persona quedan asociadas a ellas. Prepara
            un borrador, revísalo y publícalo; desde ese momento se pedirá aceptar la nueva versión.
          </p>
          {DOCUMENTOS.map((d) => {
            const versiones = legales.filter((v) => v.code === d.code);
            const vigente = versiones.find((v) => v.publishedAt);
            const borrador = versiones.find((v) => !v.publishedAt);
            const base = borrador ?? vigente;
            return (
              <Bloque
                key={d.code}
                titulo={d.nombre}
                descripcion={
                  vigente
                    ? `Vigente: versión ${vigente.version}, publicada el ${formatearFechaHora(vigente.publishedAt)} · ${vigente.acceptances} aceptaciones`
                    : "Sin versión publicada"
                }
                acciones={
                  <Link
                    href={d.ruta}
                    className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                  >
                    Ver <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                }
              >
                <p className="mb-3 text-sm font-bold">
                  {borrador ? `Borrador de la versión ${borrador.version}` : "Preparar una nueva versión"}
                </p>
                <FormularioBorradorLegal
                  code={d.code}
                  titulo={base?.title ?? d.nombre}
                  contenido={base?.contentMd ?? ""}
                />
                {borrador && (
                  <div className="mt-5 space-y-4 border-t border-border pt-5">
                    <details className="rounded-xl bg-secondary p-3">
                      <summary className="min-h-10 cursor-pointer text-sm font-bold">Vista previa del borrador</summary>
                      <div className="mt-3 max-h-96 overflow-y-auto rounded-lg bg-card p-4">
                        <Markdown source={borrador.contentMd} />
                      </div>
                    </details>
                    <PublicarLegal code={d.code} version={borrador.version} />
                    <DescartarBorrador code={d.code} />
                  </div>
                )}
                {versiones.filter((v) => v.publishedAt).length > 1 && (
                  <details className="mt-4 text-sm">
                    <summary className="min-h-10 cursor-pointer font-bold">Versiones anteriores</summary>
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {versiones
                        .filter((v) => v.publishedAt && v.version !== vigente?.version)
                        .map((v) => (
                          <li key={v.version}>
                            Versión {v.version} · {formatearFechaHora(v.publishedAt)} · {v.acceptances} aceptaciones
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </Bloque>
            );
          })}
        </section>
      </div>
    </>
  );
}
