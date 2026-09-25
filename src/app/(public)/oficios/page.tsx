import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Info } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { formatearTarifa } from "@/lib/busqueda";
import { getPublicCatalog } from "@/server/catalog/catalog";

export const metadata: Metadata = {
  title: "Oficios y servicios",
  description: "Catálogo de oficios disponibles en Acolita.App, con tarifas referenciales para el cantón Ambato.",
};

export default async function OficiosPage() {
  await connection();
  const catalogo = await getPublicCatalog();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        titulo="Oficios y servicios"
        descripcion="Estos son los oficios que puedes encontrar en Acolita.App. Cada trabajador acuerda el precio final contigo, por jornal o por obra cierta."
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

      {catalogo.map((categoria) => (
        <Section key={categoria.slug} titulo={categoria.name}>
          {categoria.description && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{categoria.description}</p>}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoria.services.map((oficio) => {
              const tarifa = formatearTarifa(oficio.priceMin, oficio.priceMax, oficio.priceUnit);
              return (
                <li key={oficio.slug}>
                  <Link
                    href={`/oficios/${oficio.slug}`}
                    className="block h-full overflow-hidden tarjeta transition-shadow hover:shadow-md"
                  >
                    {oficio.imagePath ? (
                      <Image
                        src={oficio.imagePath}
                        alt=""
                        width={800}
                        height={600}
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="h-40 w-full object-cover"
                      />
                    ) : (
                      <span className="block h-40 w-full barra-marca" aria-hidden />
                    )}
                    <div className="p-4">
                      <h3 className="text-lg font-bold">{oficio.name}</h3>
                      {oficio.description && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{oficio.description}</p>
                      )}
                      {tarifa && (
                        <p className="mt-3 inline-block rounded-lg bg-secondary px-3 py-1.5 text-sm font-bold">
                          {tarifa}
                        </p>
                      )}
                      <p className="mt-3 flex items-center gap-2 text-sm font-bold text-primary">
                        {oficio.enabledWorkers} {oficio.enabledWorkers === 1 ? "trabajador" : "trabajadores"}{" "}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

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
