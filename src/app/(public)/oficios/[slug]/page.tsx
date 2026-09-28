import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Search, Users } from "lucide-react";

import { JsonLd } from "@/components/site/JsonLd";
import { Section } from "@/components/site/SiteShell";
import { WorkerCard } from "@/components/site/WorkerCard";
import { boton } from "@/components/ui/boton";
import { formatearTarifa, parseFiltros, urlBusqueda } from "@/lib/busqueda";
import { publicEnv } from "@/lib/env.public";
import { cn } from "@/lib/utils";
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
      <header className="grid items-center gap-8 px-4 pt-6 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:pt-10">
        <div>
          <Link href="/oficios" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Ver todos los oficios
          </Link>
          <p className="mt-4 w-fit rounded-full bg-secondary px-3 py-1 text-sm font-semibold">{oficio.category.name}</p>
          <h1 className="mt-3 text-4xl leading-tight font-extrabold sm:text-5xl">{oficio.name}</h1>
          {oficio.description && (
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">{oficio.description}</p>
          )}
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            {tarifa && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Tarifa referencial</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums">{tarifa}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Trabajadores habilitados</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{resultado.total}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Valor orientativo, no vinculante. El precio final se acuerda con el trabajador.
          </p>
          <Link href={urlBusqueda(filtros, { orden: undefined })} className={cn(boton({ tamano: "lg" }), "mt-6")}>
            <Search aria-hidden /> Buscar con más filtros
          </Link>
        </div>
        {oficio.imagePath && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-[var(--shadow-elevada)]">
            <Image
              src={oficio.imagePath}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
        )}
      </header>

      <Section titulo="Trabajadores habilitados">
        {resultado.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl superficie px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-card shadow-[var(--shadow-suave)]">
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
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
