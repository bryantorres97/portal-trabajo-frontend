import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SearchX, SlidersHorizontal } from "lucide-react";

import { Paginacion } from "@/components/site/Paginacion";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { WorkerCard } from "@/components/site/WorkerCard";
import { hayFiltros, parseFiltros, urlBusqueda, type Filtros } from "@/lib/busqueda";
import { getPublicCatalog, listParishes, type Parish, type PublicCategory } from "@/server/catalog/catalog";
import { searchWorkers } from "@/server/search/workers";

export async function generateMetadata({ searchParams }: PageProps<"/buscar">): Promise<Metadata> {
  const f = parseFiltros(await searchParams);
  return {
    title: f.q ? `«${f.q}» · Buscar trabajadores` : "Buscar trabajadores",
    description:
      "Busca trabajadores de oficio habilitados por el GAD Municipalidad de Ambato por oficio, parroquia y disponibilidad.",
    // Las combinaciones de filtros no se indexan (contenido duplicado); sí la página base.
    robots: hayFiltros(f) || f.pagina > 1 ? { index: false, follow: true } : undefined,
    alternates: { canonical: "/buscar" },
  };
}

function contarFiltros(f: Filtros): number {
  return [f.q, f.categoria, f.oficio, f.parroquia, f.disponible, f.experiencia, f.calificacion].filter(Boolean).length;
}

const campo =
  "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

function FormularioFiltros({
  f,
  catalogo,
  parroquias,
  prefijo,
}: {
  f: Filtros;
  catalogo: PublicCategory[];
  parroquias: Parish[];
  prefijo: string;
}) {
  const id = (n: string) => `${prefijo}-${n}`;
  return (
    <form role="search" action="/buscar" method="get" className="space-y-4" aria-label="Filtros de búsqueda">
      <div>
        <label htmlFor={id("q")} className="text-sm font-bold">
          Qué necesitas
        </label>
        <input
          id={id("q")}
          name="q"
          type="search"
          defaultValue={f.q}
          maxLength={100}
          placeholder="Ej. fuga de agua"
          className={campo}
        />
      </div>
      <div>
        <label htmlFor={id("oficio")} className="text-sm font-bold">
          Oficio
        </label>
        <select id={id("oficio")} name="oficio" defaultValue={f.oficio ?? ""} className={campo}>
          <option value="">Todos los oficios</option>
          {catalogo.map((c) => (
            <optgroup key={c.slug} label={c.name}>
              {c.services.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={id("categoria")} className="text-sm font-bold">
          Categoría
        </label>
        <select id={id("categoria")} name="categoria" defaultValue={f.categoria ?? ""} className={campo}>
          <option value="">Todas</option>
          {catalogo.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={id("parroquia")} className="text-sm font-bold">
          Parroquia
        </label>
        <select id={id("parroquia")} name="parroquia" defaultValue={f.parroquia ?? ""} className={campo}>
          <option value="">Todo el cantón</option>
          <optgroup label="Urbanas">
            {parroquias
              .filter((p) => p.kind === "URBANA")
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Rurales">
            {parroquias
              .filter((p) => p.kind === "RURAL")
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id("experiencia")} className="text-sm font-bold">
            Experiencia
          </label>
          <select id={id("experiencia")} name="experiencia" defaultValue={f.experiencia ?? ""} className={campo}>
            <option value="">Todas</option>
            <option value="2">2+ años</option>
            <option value="5">5+ años</option>
            <option value="10">10+ años</option>
          </select>
        </div>
        <div>
          <label htmlFor={id("calificacion")} className="text-sm font-bold">
            Calificación
          </label>
          <select id={id("calificacion")} name="calificacion" defaultValue={f.calificacion ?? ""} className={campo}>
            <option value="">Todas</option>
            <option value="3">3+ estrellas</option>
            <option value="4">4+ estrellas</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={id("orden")} className="text-sm font-bold">
          Ordenar por
        </label>
        <select id={id("orden")} name="orden" defaultValue={f.orden ?? ""} className={campo}>
          <option value="">Más relevantes</option>
          <option value="calificacion">Mejor calificados</option>
          <option value="experiencia">Más experiencia</option>
          <option value="nombre">Nombre</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="disponible"
          value="1"
          defaultChecked={f.disponible}
          className="h-5 w-5 accent-primary"
        />
        Solo disponibles ahora
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          Aplicar filtros
        </button>
        {hayFiltros(f) && (
          <Link
            href="/buscar"
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold"
          >
            Limpiar
          </Link>
        )}
      </div>
    </form>
  );
}

export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  await connection();
  const f = parseFiltros(await searchParams);
  const [catalogo, parroquias, resultado] = await Promise.all([getPublicCatalog(), listParishes(), searchWorkers(f)]);

  return (
    <>
      <PageHeader
        eyebrow="Buscar"
        titulo={f.q ? `Resultados para «${f.q}»` : "Encuentra un trabajador"}
        descripcion="Solo aparecen trabajadores registrados, capacitados y habilitados por el GAD Municipalidad de Ambato."
      />
      <div className="grid gap-2 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Section>
          <details className="tarjeta p-4 lg:hidden">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold">
              <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filtros
              {contarFiltros(f) > 0 && (
                <span className="rounded-lg bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {contarFiltros(f)} {contarFiltros(f) === 1 ? "activo" : "activos"}
                </span>
              )}
            </summary>
            <div className="mt-4">
              <FormularioFiltros f={f} catalogo={catalogo} parroquias={parroquias} prefijo="movil" />
            </div>
          </details>
          <aside className="hidden tarjeta p-4 lg:block" aria-label="Filtros">
            <FormularioFiltros f={f} catalogo={catalogo} parroquias={parroquias} prefijo="escritorio" />
          </aside>
        </Section>

        <Section>
          <p className="mb-4 text-sm text-muted-foreground" role="status">
            {resultado.total === 0
              ? "No encontramos trabajadores con esos criterios."
              : `${resultado.total} ${resultado.total === 1 ? "trabajador encontrado" : "trabajadores encontrados"}`}
          </p>
          {resultado.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 tarjeta p-8 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="font-bold">Prueba con otra palabra o quita algunos filtros</p>
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                <Link href="/oficios" className="font-bold text-primary">
                  Ver todos los oficios
                </Link>
                {hayFiltros(f) && (
                  <Link href="/buscar" className="font-bold text-primary">
                    Quitar filtros
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {resultado.items.map((w) => (
                  <li key={w.id}>
                    <WorkerCard worker={w} headingLevel={2} />
                  </li>
                ))}
              </ul>
              <Paginacion
                actual={resultado.page}
                total={resultado.pages}
                enlace={(p) => urlBusqueda(f, { pagina: p })}
              />
            </>
          )}
        </Section>
      </div>
    </>
  );
}
