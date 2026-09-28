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
  description: "Catálogo de oficios disponibles en Llankana, con tarifas referenciales para el cantón Ambato.",
};

export default async function OficiosPage() {
  await connection();
  const catalogo = await getPublicCatalog();

  return (
    <>
      <PageHeader
        titulo="Oficios y servicios"
        descripcion="Estos son los oficios que puedes encontrar en Llankana. Cada trabajador acuerda el precio final contigo, por día o por obra cierta."
      />

      <Section>
        <p className="flex gap-3 rounded-2xl bg-amarillo/15 p-4 text-sm leading-relaxed text-foreground">
          <Info className="h-5 w-5 shrink-0 text-naranja" aria-hidden />
          <span>
            Las tarifas mostradas son <strong>referenciales y no vinculantes</strong>. El Municipio no fija precios ni
            interviene en el pago, que se realiza directo al trabajador.
          </span>
        </p>
      </Section>

      {catalogo.map((categoria) => (
        <Section key={categoria.slug} className="pt-10">
          <div className="mb-5 flex items-start gap-3">
            <span className={`mt-1.5 h-7 w-1.5 shrink-0 rounded-full bg-${categoria.color}`} aria-hidden />
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">{categoria.name}</h2>
              {categoria.description && <p className="mt-1 text-muted-foreground">{categoria.description}</p>}
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoria.services.map((oficio) => {
              const tarifa = formatearTarifa(oficio.priceMin, oficio.priceMax, oficio.priceUnit);
              return (
                <li key={oficio.slug}>
                  <Link
                    href={`/oficios/${oficio.slug}`}
                    className="group flex h-full flex-col overflow-hidden tarjeta transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevada)]"
                  >
                    {oficio.imagePath ? (
                      <Image
                        src={oficio.imagePath}
                        alt=""
                        width={800}
                        height={600}
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="aspect-[16/10] h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="block aspect-[16/10] w-full barra-marca opacity-40" aria-hidden />
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="text-lg font-bold">{oficio.name}</h3>
                      {oficio.description && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{oficio.description}</p>
                      )}
                      {tarifa && (
                        <p className="mt-3 w-fit rounded-full bg-secondary px-3 py-1 text-sm font-bold tabular-nums">
                          {tarifa}
                        </p>
                      )}
                      <p className="mt-auto flex items-center gap-2 pt-4 text-sm font-bold text-primary">
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

      <Section titulo="Modalidades de contratación" className="pt-10">
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl superficie p-5">
            <h3 className="text-base font-bold">Por día</h3>
            <p className="mt-1 text-sm text-muted-foreground">Se paga por cada día de trabajo.</p>
          </article>
          <article className="rounded-2xl superficie p-5">
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
