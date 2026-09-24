import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { oficios } from "@/content/site";

function buscarOficio(slug: string) {
  return oficios.find((o) => o.slug === slug);
}

export function generateStaticParams() {
  return oficios.map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: PageProps<"/oficios/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const oficio = buscarOficio(slug);
  if (!oficio) return { title: "Oficio no disponible", robots: { index: false } };
  return {
    title: `${oficio.nombre} en Ambato`,
    description: `${oficio.descripcion} Trabajadores habilitados por el GAD Municipalidad de Ambato.`,
  };
}

export default async function OficioPage({ params }: PageProps<"/oficios/[slug]">) {
  const { slug } = await params;
  const oficio = buscarOficio(slug);
  if (!oficio) notFound();

  return (
    <>
      <div className="px-4 pt-6">
        <Link href="/oficios" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Ver todos los oficios
        </Link>
      </div>

      <PageHeader eyebrow="Oficio" titulo={oficio.nombre} descripcion={oficio.descripcion} />

      <Section>
        <div className="overflow-hidden tarjeta sm:flex">
          <Image
            src={oficio.imagen}
            alt=""
            width={800}
            height={600}
            priority
            sizes="(min-width: 640px) 40vw, 100vw"
            className="h-48 w-full object-cover sm:h-auto sm:w-2/5"
          />
          <div className="p-5">
            <p className="text-sm font-semibold text-muted-foreground">Tarifa referencial</p>
            <p className="mt-1 text-2xl font-extrabold">{oficio.jornal}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Valor orientativo, no vinculante. El precio final se acuerda con el trabajador.
            </p>
          </div>
        </div>
      </Section>

      {/* Fase 3: listado de trabajadores habilitados desde la base de datos. */}
      <Section titulo="Trabajadores habilitados">
        <div className="flex flex-col items-center gap-3 tarjeta p-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
            <Users className="h-7 w-7 text-primary" aria-hidden />
          </span>
          <p className="text-base font-bold">Muy pronto verás aquí a los trabajadores de este oficio</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Estamos incorporando a los trabajadores habilitados por el Municipio. Mientras tanto, puedes escribirnos y
            te orientamos.
          </p>
          <Link href="/contacto" className="mt-2 text-sm font-bold text-primary">
            Ir a contacto
          </Link>
        </div>
      </Section>
    </>
  );
}
