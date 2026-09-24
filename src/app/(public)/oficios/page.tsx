import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { oficios } from "@/content/site";

export const metadata: Metadata = {
  title: "Oficios y servicios",
  description: "Catálogo de oficios disponibles en Acolita.App, con tarifas referenciales para el cantón Ambato.",
};

export default function OficiosPage() {
  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        titulo="Oficios y servicios"
        descripcion="Estos son los oficios que puedes encontrar en Acolita.App. Cada trabajador acuerda el precio final directamente contigo, por jornal o por obra cierta."
      />

      <Section>
        <p className="flex gap-3 rounded-2xl border border-amarillo/50 bg-amarillo/10 p-4 text-sm leading-relaxed text-foreground">
          <Info className="h-5 w-5 shrink-0 text-naranja" aria-hidden />
          <span>
            Las tarifas mostradas son <strong>referenciales y no vinculantes</strong>. El Municipio no fija precios ni
            interviene en el pago, que se realiza directo al trabajador.
          </span>
        </p>
      </Section>

      <Section>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {oficios.map((oficio) => (
            <li key={oficio.slug}>
              <Link
                href={`/oficios/${oficio.slug}`}
                className="block overflow-hidden tarjeta transition-shadow hover:shadow-md"
              >
                <Image
                  src={oficio.imagen}
                  alt=""
                  width={800}
                  height={600}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="h-40 w-full object-cover"
                />
                <div className="p-4">
                  <h2 className="text-lg font-bold">{oficio.nombre}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{oficio.descripcion}</p>
                  <p className="mt-3 inline-block rounded-lg bg-secondary px-3 py-1.5 text-sm font-bold">
                    {oficio.jornal}
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-sm font-bold text-primary">
                    Ver detalle <ArrowRight className="h-4 w-4" aria-hidden />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section titulo="Modalidades de contratación">
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="tarjeta p-4">
            <h3 className="text-base font-bold">Jornal</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se paga por unidad de tiempo, normalmente el día de trabajo.
            </p>
          </article>
          <article className="tarjeta p-4">
            <h3 className="text-base font-bold">Obra cierta</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se paga un precio global por un resultado específico, sin relación con el tiempo empleado.
            </p>
          </article>
        </div>
      </Section>
    </>
  );
}
