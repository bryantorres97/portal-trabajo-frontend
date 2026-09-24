"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import type { Oficio } from "@/content/site";
import { normalizarTexto } from "@/lib/texto";

/**
 * Buscador de oficios del inicio. En la Fase 3 se reemplaza la búsqueda local
 * por la API de búsqueda (`/api/v1/workers`, `/api/v1/categories`).
 */
export function BuscadorOficios({ oficios }: { oficios: Oficio[] }) {
  const [consulta, setConsulta] = useState("");
  const idResultados = useId();

  const resultados = useMemo(() => {
    const q = normalizarTexto(consulta.trim());
    if (!q) return oficios;
    return oficios.filter((o) => normalizarTexto(o.nombre).includes(q) || normalizarTexto(o.descripcion).includes(q));
  }, [consulta, oficios]);

  return (
    <>
      <section className="px-4 pt-7 pb-4">
        <h1 className="text-[2rem] leading-[1.08] font-extrabold sm:text-5xl">
          ¿Qué servicio <span className="texto-marca">necesitas</span> hoy?
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Trabajadores de oficio registrados, capacitados y habilitados por el GAD Municipalidad de Ambato.
        </p>

        <div className="sticky top-[4.4rem] z-30 -mx-4 mt-5 bg-background/95 px-4 py-3 backdrop-blur">
          <label className="flex items-center gap-2 rounded-2xl border-2 border-border bg-card px-4 focus-within:border-primary">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscar actividad a contratar</span>
            <input
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              aria-controls={idResultados}
              placeholder="Ej. albañilería, cerrajería, plomería…"
              className="min-h-13 w-full bg-transparent text-base font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />
            {consulta && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setConsulta("")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </label>
        </div>
      </section>

      <section className="px-4 py-6" aria-live="polite">
        <h2 className="mb-4 text-xl font-extrabold sm:text-2xl">
          {consulta ? `Resultados (${resultados.length})` : "Servicios más solicitados"}
        </h2>
        {resultados.length === 0 ? (
          <p className="tarjeta p-5 text-sm text-muted-foreground">
            No encontramos esa actividad. Prueba con otra palabra o{" "}
            <Link href="/contacto" className="font-bold text-primary">
              escríbenos
            </Link>
            .
          </p>
        ) : (
          <ul id={idResultados} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resultados.map((oficio) => (
              <li key={oficio.slug} className="min-w-0">
                <Link
                  href={`/oficios/${oficio.slug}`}
                  className="flex min-h-[5.5rem] items-center gap-3 overflow-hidden tarjeta p-3 text-left transition-shadow hover:shadow-md"
                >
                  <Image
                    src={oficio.imagen}
                    alt=""
                    width={128}
                    height={128}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                  <span className="block min-w-0 flex-1">
                    <span className="block text-base font-bold">{oficio.nombre}</span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">{oficio.descripcion}</span>
                    <span className="mt-1 block text-xs font-bold tracking-wide text-primary uppercase">
                      {oficio.jornal}
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
