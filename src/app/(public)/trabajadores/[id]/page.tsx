import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, BadgeCheck, Briefcase, CalendarCheck, MapPin, MessageCircle, ShieldCheck } from "lucide-react";

import { Estrellas } from "@/components/site/Estrellas";
import { JsonLd } from "@/components/site/JsonLd";
import { Section } from "@/components/site/SiteShell";
import { Avatar, Disponibilidad, fotoTrabajador } from "@/components/site/WorkerCard";
import { formatearTarifa } from "@/lib/busqueda";
import { publicEnv } from "@/lib/env.public";
import { getPublicWorker } from "@/server/search/workers";

export async function generateMetadata({ params }: PageProps<"/trabajadores/[id]">): Promise<Metadata> {
  const { id } = await params;
  const w = await getPublicWorker(id);
  if (!w) return { title: "Perfil no disponible", robots: { index: false } };
  const oficios = w.services.map((s) => s.name).join(", ");
  return {
    title: `${w.displayName} · ${oficios}`,
    description: `${w.displayName}, ${oficios.toLowerCase()} en Ambato. ${w.yearsExperience} años de experiencia. Trabajador habilitado por el GAD Municipalidad de Ambato.`,
    alternates: { canonical: `/trabajadores/${w.id}` },
  };
}

const formatoMes = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "America/Guayaquil" });

export default async function TrabajadorPage({ params }: PageProps<"/trabajadores/[id]">) {
  await connection();
  const { id } = await params;
  const w = await getPublicWorker(id);
  if (!w) notFound();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: w.displayName,
          jobTitle: w.services.map((s) => s.name).join(", "),
          description: w.specialty ?? undefined,
          address: {
            "@type": "PostalAddress",
            addressLocality: "Ambato",
            addressRegion: "Tungurahua",
            addressCountry: "EC",
          },
          url: `${publicEnv.NEXT_PUBLIC_APP_URL}/trabajadores/${w.id}`,
        }}
      />
      <div className="px-4 pt-6">
        <Link href="/buscar" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la búsqueda
        </Link>
      </div>

      <header className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-4">
          <Avatar
            nombre={w.displayName}
            foto={w.hasPhoto ? fotoTrabajador(w.id) : null}
            className="h-20 w-20 text-2xl"
          />
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight font-extrabold">{w.displayName}</h1>
            {w.specialty && <p className="mt-1 text-base text-muted-foreground">{w.specialty}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-verde-fuerte">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Habilitado por el GAD Municipalidad de Ambato
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Section>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="tarjeta p-3">
                <dt className="text-xs text-muted-foreground">Calificación</dt>
                <dd className="mt-1 text-sm font-bold">
                  {w.ratingCount > 0 ? (
                    <span className="flex flex-col gap-0.5">
                      <Estrellas valor={w.ratingAvg} tamaño="sm" />
                      {w.ratingAvg.toFixed(1)} · {w.ratingCount} {w.ratingCount === 1 ? "opinión" : "opiniones"}
                    </span>
                  ) : (
                    "Sin calificaciones aún"
                  )}
                </dd>
              </div>
              <div className="tarjeta p-3">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5" aria-hidden /> Experiencia
                </dt>
                <dd className="mt-1 text-sm font-bold">
                  {w.yearsExperience} {w.yearsExperience === 1 ? "año" : "años"}
                </dd>
              </div>
              <div className="tarjeta p-3">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> Trabajos
                </dt>
                <dd className="mt-1 text-sm font-bold">{w.contractsCompleted} en la plataforma</dd>
              </div>
              <div className="tarjeta p-3">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> Zona
                </dt>
                <dd className="mt-1 text-sm font-bold">{w.parish ?? "Ambato"}</dd>
              </div>
            </dl>
          </Section>

          {w.bio && (
            <Section titulo="Sobre mí">
              <p className="tarjeta p-5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{w.bio}</p>
            </Section>
          )}

          <Section titulo="Oficios y tarifas referenciales">
            <ul className="space-y-3">
              {w.services.map((s) => {
                const tarifa = formatearTarifa(s.priceMin, s.priceMax, s.priceUnit);
                return (
                  <li key={s.slug} className="tarjeta p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-bold">
                        <Link href={`/oficios/${s.slug}`} className="hover:underline">
                          {s.name}
                        </Link>
                        {s.isPrimary && <span className="ml-2 text-xs font-semibold text-primary">Principal</span>}
                      </h3>
                      <span className="text-xs text-muted-foreground">{s.category}</span>
                    </div>
                    {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                    {tarifa && <p className="mt-2 text-sm font-semibold">{tarifa}</p>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Las tarifas son referenciales. El precio final se acuerda con el trabajador dentro de la plataforma.
            </p>
          </Section>

          {/* Fase 7: reseñas de clientes con contratación finalizada. */}
        </div>

        <aside>
          <Section>
            <div className="space-y-4 tarjeta p-5 lg:sticky lg:top-24">
              <Disponibilidad disponible={w.isAvailable} />
              {w.availabilityNote && <p className="text-sm text-muted-foreground">{w.availabilityNote}</p>}
              {/* Fase 5: inicia la conversación en el chat interno (el teléfono nunca se muestra, RN-19). */}
              <button
                type="button"
                disabled
                aria-describedby="contacto-nota"
                className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground opacity-60"
              >
                <MessageCircle className="h-5 w-5" aria-hidden /> Escribir por el chat
              </button>
              <p id="contacto-nota" className="text-xs text-muted-foreground">
                Muy pronto podrás escribirle directamente desde la plataforma. Por seguridad, el contacto se realiza
                solo por el chat del portal.
              </p>
              <p className="flex gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-verde" aria-hidden />
                <span>
                  {w.enabledAt
                    ? `Habilitado desde ${formatoMes.format(new Date(w.enabledAt))}.`
                    : "Habilitado por el GAD."}{" "}
                  Registrado, capacitado y habilitado por el Municipio.
                </span>
              </p>
            </div>
          </Section>
        </aside>
      </div>
    </>
  );
}
