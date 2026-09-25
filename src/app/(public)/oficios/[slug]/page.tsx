import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Search, Users } from "lucide-react";

import { JsonLd } from "@/components/site/JsonLd";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { WorkerCard } from "@/components/site/WorkerCard";
import { formatearTarifa, parseFiltros, urlBusqueda } from "@/lib/busqueda";
import { publicEnv } from "@/lib/env.public";
import { getPublicService } from "@/server/catalog/catalog";
import { searchWorkers } from "@/server/search/workers";

export async function generateMetadata({ params }: PageProps<"/oficios/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const oficio = await getPublicService(slug);
  if (!oficio) return { title: "Oficio no disponible", robots: { index: false } };
  return {
    title: `${oficio.name} en Ambato`,
    description: `${oficio.description ?? oficio.name}. ${oficio.enabledWorkers} trabajadores habilitados por el GAD Municipalidad de Ambato.`,
    alternates: { canonical: `/oficios/${oficio.slug}` },
  };
}

export default async function OficioPage({ params }: PageProps<"/oficios/[slug]">) {
  await connection();
  const { slug } = await params;
  const oficio = await getPublicService(slug);
  if (!oficio) notFound();

  const filtros = parseFiltros({ oficio: slug, orden: "calificacion" });
  const resultado = await searchWorkers(filtros);
  const tarifa = formatearTarifa(oficio.priceMin, oficio.priceMax, oficio.priceUnit);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          name: oficio.name,
          description: oficio.description ?? undefined,
          serviceType: oficio.category.name,
          areaServed: { "@type": "City", name: "Ambato" },
          provider: { "@type": "GovernmentOrganization", name: "GAD Municipalidad de Ambato" },
          url: `${publicEnv.NEXT_PUBLIC_APP_URL}/oficios/${oficio.slug}`,
        }}
      />
      <div className="px-4 pt-6">
        <Link href="/oficios" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Ver todos los oficios
        </Link>
      </div>

      <PageHeader eyebrow={oficio.category.name} titulo={oficio.name} descripcion={oficio.description ?? ""} />

      <Section>
        <div className="overflow-hidden tarjeta sm:flex">
          {oficio.imagePath && (
            <Image
              src={oficio.imagePath}
              alt=""
              width={800}
              height={600}
              priority
              sizes="(min-width: 640px) 40vw, 100vw"
              className="h-48 w-full object-cover sm:h-auto sm:w-2/5"
            />
          )}
          <div className="p-5">
            {tarifa && (
              <>
                <p className="text-sm font-semibold text-muted-foreground">Tarifa referencial</p>
                <p className="mt-1 text-2xl font-extrabold">{tarifa}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Valor orientativo, no vinculante. El precio final se acuerda con el trabajador.
                </p>
              </>
            )}
            <Link
              href={urlBusqueda(filtros, { orden: undefined })}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              <Search className="h-4 w-4" aria-hidden /> Buscar con más filtros
            </Link>
          </div>
        </div>
      </Section>

      <Section titulo={`Trabajadores habilitados (${resultado.total})`}>
        {resultado.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 tarjeta p-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
              <Users className="h-7 w-7 text-primary" aria-hidden />
            </span>
            <p className="text-base font-bold">Aún no hay trabajadores habilitados en este oficio</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Estamos incorporando a más trabajadores. Mientras tanto, puedes escribirnos y te orientamos.
            </p>
            <Link href="/contacto" className="mt-2 text-sm font-bold text-primary">
              Ir a contacto
            </Link>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resultado.items.map((w) => (
                <li key={w.id}>
                  <WorkerCard worker={w} />
                </li>
              ))}
            </ul>
            {resultado.total > resultado.items.length && (
              <p className="mt-4 text-sm">
                <Link href={urlBusqueda(filtros, { pagina: 2 })} className="font-bold text-primary">
                  Ver más trabajadores de {oficio.name.toLowerCase()} →
                </Link>
              </p>
            )}
          </>
        )}
      </Section>
    </>
  );
}
