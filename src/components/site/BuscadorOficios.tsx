"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, MessageCircle, Search, ShieldCheck, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { boton } from "@/components/ui/boton";
import { normalizarTexto } from "@/lib/texto";
import { cn } from "@/lib/utils";

export type OficioResumen = {
  slug: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  tarifa: string | null;
  enabledWorkers: number;
};

const garantias = [
  { icon: BadgeCheck, texto: "Habilitados por el GAD" },
  { icon: MessageCircle, texto: "Chat seguro, sin compartir tu teléfono" },
  { icon: ShieldCheck, texto: "Acuerdos registrados" },
];

/**
 * Portada del inicio: buscador (formulario GET a /buscar, funciona sin JavaScript) que además
 * filtra los oficios mientras se escribe, y la grilla de oficios con fotos.
 */
export function BuscadorOficios({ oficios }: { oficios: OficioResumen[] }) {
  const [consulta, setConsulta] = useState("");
  const idResultados = useId();

  const resultados = useMemo(() => {
    const q = normalizarTexto(consulta.trim());
    if (!q) return oficios;
    return oficios.filter(
      (o) => normalizarTexto(o.name).includes(q) || normalizarTexto(o.description ?? "").includes(q),
    );
  }, [consulta, oficios]);

  const populares = [...oficios].sort((a, b) => b.enabledWorkers - a.enabledWorkers).slice(0, 4);
  const mosaico = oficios.filter((o) => o.imagePath).slice(0, 3);

  return (
    <>
      <section className="grid items-center gap-10 px-4 pt-8 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-16 lg:pb-16">
        <div>
          <h1 className="text-[2.35rem] leading-[1.05] font-extrabold sm:text-6xl">
            ¿Qué servicio{" "}
            <span className="relative inline-block">
              necesitas
              <span className="absolute inset-x-0 -bottom-1 h-2 rounded-full barra-marca opacity-90" aria-hidden />
            </span>{" "}
            hoy?
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Trabajadores de oficio registrados, capacitados y habilitados por el GAD Municipalidad de Ambato.
          </p>

          <form role="search" action="/buscar" method="get" className="mt-8">
            <div className="flex items-center gap-2 rounded-3xl bg-card p-2 shadow-[var(--shadow-elevada)] ring-1 ring-border focus-within:ring-2 focus-within:ring-primary">
              <label className="flex min-w-0 flex-1 items-center gap-3 pl-3">
                <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="sr-only">Buscar un oficio o trabajador</span>
                <input
                  type="search"
                  name="q"
                  value={consulta}
                  onChange={(e) => setConsulta(e.target.value)}
                  aria-controls={idResultados}
                  maxLength={100}
                  placeholder="Ej.: albañilería, plomería, electricidad…"
                  className="min-h-12 w-full min-w-0 bg-transparent text-base font-semibold text-foreground outline-none placeholder:font-normal [&::-webkit-search-cancel-button]:hidden"
                />
                {consulta && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => setConsulta("")}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </label>
              <button type="submit" className={boton({ tamano: "md" })}>
                Buscar
              </button>
            </div>
          </form>

          {populares.length > 0 && !consulta && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Lo más buscado:</span>
              {populares.map((o) => (
                <Link
                  key={o.slug}
                  href={`/oficios/${o.slug}`}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {o.name}
                </Link>
              ))}
            </div>
          )}

          <ul className="mt-8 flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:flex-wrap sm:gap-x-6">
            {garantias.map((g) => (
              <li key={g.texto} className="flex items-center gap-2">
                <g.icon className="h-5 w-5 text-verde-fuerte" aria-hidden />
                {g.texto}
              </li>
            ))}
          </ul>
        </div>

        {mosaico.length === 3 && (
          <div className="relative hidden aspect-[5/4] lg:block" aria-hidden>
            <div className="absolute inset-0 grid grid-cols-[1.2fr_1fr] grid-rows-2 gap-3">
              {mosaico.map((o, i) => (
                <div
                  key={o.slug}
                  className={cn(
                    "relative overflow-hidden rounded-3xl shadow-[var(--shadow-elevada)]",
                    i === 0 && "row-span-2",
                  )}
                >
                  <Image
                    src={o.imagePath!}
                    alt=""
                    fill
                    priority={i === 0}
                    sizes="(min-width: 1024px) 28vw, 0px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            <div className="absolute -bottom-5 -left-6 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-[var(--shadow-elevada)]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-verde/15 text-verde-fuerte">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <span className="text-sm leading-tight">
                <span className="block font-bold">Verificados por el Municipio</span>
                <span className="text-muted-foreground">Registro, capacitación y habilitación</span>
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="px-4 py-8 sm:px-6" aria-live="polite">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            {consulta ? `Oficios que coinciden (${resultados.length})` : "Oficios disponibles"}
          </h2>
          <Link href="/oficios" className="hidden shrink-0 items-center gap-1 text-sm font-bold text-primary sm:flex">
            Ver tarifas <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {resultados.length === 0 ? (
          <p className="panel p-6 text-muted-foreground">
            Ningún oficio coincide con «{consulta}». Presiona <strong className="text-foreground">Buscar</strong> para
            buscar entre los trabajadores o{" "}
            <Link href="/contacto" className="font-bold text-primary underline underline-offset-4">
              escríbenos
            </Link>
            .
          </p>
        ) : (
          <ul id={idResultados} className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {resultados.map((oficio) => (
              <li key={oficio.slug} className="min-w-0">
                <Link
                  href={`/oficios/${oficio.slug}`}
                  className="group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-secondary shadow-[var(--shadow-suave)] sm:aspect-[4/3.6]"
                >
                  {oficio.imagePath ? (
                    <Image
                      src={oficio.imagePath}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 18rem, (min-width: 768px) 33vw, 50vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                  ) : (
                    <span className="absolute inset-0 barra-marca opacity-40" aria-hidden />
                  )}
                  <span
                    className="absolute inset-0 bg-gradient-to-t from-[oklch(0.18_0.03_265/0.85)] via-[oklch(0.18_0.03_265/0.25)] to-transparent"
                    aria-hidden
                  />
                  <span className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <span className="block font-display text-lg leading-tight font-bold sm:text-xl">{oficio.name}</span>
                    <span className="mt-1 block text-sm text-white/85">
                      {oficio.enabledWorkers} {oficio.enabledWorkers === 1 ? "trabajador" : "trabajadores"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
