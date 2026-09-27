import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, BadgeCheck, Briefcase, CalendarCheck, MapPin, MessageCircle, ShieldCheck } from "lucide-react";

import { ResenasPublicas } from "@/components/reviews/ResenasPublicas";
import { Estrellas } from "@/components/site/Estrellas";
import { JsonLd } from "@/components/site/JsonLd";
import { Avatar, Disponibilidad, fotoTrabajador } from "@/components/site/WorkerCard";
import { boton } from "@/components/ui/boton";
import { formatearTarifa } from "@/lib/busqueda";
import { publicEnv } from "@/lib/env.public";
import { cn } from "@/lib/utils";
import { listPublicWorkerReviews, listReviewReportReasons } from "@/server/reviews/reviews";
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
  const [resenas, motivos] = await Promise.all([listPublicWorkerReviews(w.id), listReviewReportReasons()]);

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
          ...(w.ratingCount > 0 && resenas.total > 0
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: w.ratingAvg,
                  reviewCount: w.ratingCount,
                  bestRating: 5,
                  worstRating: 1,
                },
              }
            : {}),
        }}
      />
      <div className="px-4 pt-6 sm:px-6">
        <Link href="/buscar" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la búsqueda
        </Link>
      </div>

      <header className="px-4 pt-4 pb-8 sm:px-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <Avatar
            nombre={w.displayName}
            foto={w.hasPhoto ? fotoTrabajador(w.id) : null}
            className="h-20 w-20 rounded-3xl text-2xl shadow-[var(--shadow-suave)] sm:h-28 sm:w-28 sm:text-3xl"
          />
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-verde/15 px-3 py-1 text-xs font-semibold text-verde-fuerte sm:text-sm">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Habilitado por el GAD Municipalidad de Ambato
            </p>
            <h1 className="mt-2 text-3xl leading-tight font-extrabold sm:mt-3 sm:text-5xl">{w.displayName}</h1>
            {w.specialty && <p className="mt-1 text-base text-muted-foreground sm:text-lg">{w.specialty}</p>}
          </div>
        </div>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-y border-border/70 py-5">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Calificación</dt>
            <dd className="mt-1 flex items-center gap-2 text-base font-bold">
              {w.ratingCount > 0 ? (
                <>
                  <Estrellas valor={w.ratingAvg} tamaño="md" />
                  <span className="tabular-nums">
                    {w.ratingAvg.toFixed(1)}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({w.ratingCount} {w.ratingCount === 1 ? "opinión" : "opiniones"})
                    </span>
                  </span>
                </>
              ) : (
                <span className="font-normal text-muted-foreground">Sin calificaciones aún</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5" aria-hidden /> Experiencia
            </dt>
            <dd className="mt-1 text-base font-bold">
              {w.yearsExperience} {w.yearsExperience === 1 ? "año" : "años"}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> Trabajos
            </dt>
            <dd className="mt-1 text-base font-bold">{w.contractsCompleted} en la plataforma</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> Zona
            </dt>
            <dd className="mt-1 text-base font-bold">{w.parish ?? "Ambato"}</dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          {w.bio && (
            <section aria-labelledby="titulo-sobre">
              <h2 id="titulo-sobre" className="text-2xl font-extrabold">
                Sobre mí
              </h2>
              <p className="mt-3 max-w-prose text-base leading-relaxed whitespace-pre-line text-muted-foreground">
                {w.bio}
              </p>
            </section>
          )}

          <section aria-labelledby="titulo-oficios">
            <h2 id="titulo-oficios" className="text-2xl font-extrabold">
              Oficios y tarifas referenciales
            </h2>
            <ul className="mt-4 divide-y divide-border/70 panel">
              {w.services.map((s) => {
                const tarifa = formatearTarifa(s.priceMin, s.priceMax, s.priceUnit);
                return (
                  <li key={s.slug} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 text-base font-bold">
                        <Link href={`/oficios/${s.slug}`} className="hover:text-primary hover:underline">
                          {s.name}
                        </Link>
                        {s.isPrimary && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                            Principal
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">{s.category}</p>
                      {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                    </div>
                    {tarifa && <p className="text-sm font-bold tabular-nums">{tarifa}</p>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Las tarifas son referenciales. El precio final se acuerda con el trabajador dentro de la plataforma.
            </p>
          </section>

          <section aria-labelledby="titulo-resenas" id="resenas" className="scroll-mt-24">
            <h2 id="titulo-resenas" className="text-2xl font-extrabold">
              Reseñas de clientes{resenas.total > 0 ? ` (${resenas.total})` : ""}
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Solo opinan clientes que lo contrataron por la plataforma y terminaron el trabajo.
            </p>
            <ResenasPublicas
              workerId={w.id}
              inicial={resenas.items}
              total={resenas.total}
              hayMasInicial={resenas.hasMore}
              motivos={motivos}
            />
          </section>
        </div>

        <aside aria-label="Contacto">
          <div className="space-y-4 panel p-6 lg:sticky lg:top-24">
            <Disponibilidad disponible={w.isAvailable} />
            {w.availabilityNote && <p className="text-sm text-muted-foreground">{w.availabilityNote}</p>}
            {/* Inicia la conversación en el chat interno: el teléfono nunca se muestra (RN-19, ADR-010). */}
            <Link
              href={`/mensajes/nuevo?trabajador=${w.id}`}
              aria-describedby="contacto-nota"
              className={cn(boton({ tamano: "lg" }), "hidden w-full lg:flex")}
            >
              <MessageCircle aria-hidden /> Escribir por el chat
            </Link>
            <p id="contacto-nota" className="text-sm text-muted-foreground">
              Necesitas iniciar sesión. Por seguridad, el contacto se realiza solo por el chat del portal y la
              conversación queda registrada.
            </p>
            <p className="flex gap-2 border-t border-border/70 pt-4 text-sm text-muted-foreground">
              <ShieldCheck className="h-5 w-5 shrink-0 text-verde-fuerte" aria-hidden />
              <span>
                {w.enabledAt
                  ? `Habilitado desde ${formatoMes.format(new Date(w.enabledAt))}.`
                  : "Habilitado por el GAD."}{" "}
                Registrado, capacitado y habilitado por el Municipio.
              </span>
            </p>
          </div>
        </aside>
      </div>

      {/* Móvil: la acción principal siempre a mano, sobre la barra inferior. */}
      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur-md md:bottom-0 lg:hidden">
        <Link href={`/mensajes/nuevo?trabajador=${w.id}`} className={cn(boton({ tamano: "lg" }), "w-full")}>
          <MessageCircle aria-hidden /> Escribir por el chat
        </Link>
      </div>
      <div className="h-24 lg:hidden" aria-hidden />
    </>
  );
}
