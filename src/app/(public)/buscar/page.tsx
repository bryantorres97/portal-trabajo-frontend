import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronDown, Search, SearchX, SlidersHorizontal, X } from "lucide-react";

import { FormularioAutoEnvio } from "@/components/site/FormularioAutoEnvio";
import { Paginacion } from "@/components/site/Paginacion";
import { PageHeader } from "@/components/site/SiteShell";
import { WorkerCard } from "@/components/site/WorkerCard";
import { boton } from "@/components/ui/boton";
import { hayFiltros, parseFiltros, urlBusqueda, type Filtros } from "@/lib/busqueda";
import { cn } from "@/lib/utils";
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

const control =
  "min-h-12 w-full appearance-none rounded-2xl border border-input bg-card px-4 pr-10 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-ring/30";

function Selector({
  id,
  etiqueta,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { id: string; etiqueta: string }) {
  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <select id={id} className={control} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

/** Filtros activos como etiquetas que se quitan con un toque. */
function filtrosActivos(f: Filtros, catalogo: PublicCategory[], parroquias: Parish[]) {
  const servicios = catalogo.flatMap((c) => c.services);
  const chips: { etiqueta: string; href: string }[] = [];
  if (f.q) chips.push({ etiqueta: `«${f.q}»`, href: urlBusqueda(f, { q: undefined, pagina: 1 }) });
  if (f.oficio)
    chips.push({
      etiqueta: servicios.find((s) => s.slug === f.oficio)?.name ?? f.oficio,
      href: urlBusqueda(f, { oficio: undefined, pagina: 1 }),
    });
  if (f.categoria)
    chips.push({
      etiqueta: catalogo.find((c) => c.slug === f.categoria)?.name ?? f.categoria,
      href: urlBusqueda(f, { categoria: undefined, pagina: 1 }),
    });
  if (f.parroquia)
    chips.push({
      etiqueta: parroquias.find((p) => p.code === f.parroquia)?.name ?? f.parroquia,
      href: urlBusqueda(f, { parroquia: undefined, pagina: 1 }),
    });
  if (f.disponible)
    chips.push({ etiqueta: "Disponibles ahora", href: urlBusqueda(f, { disponible: undefined, pagina: 1 }) });
  if (f.experiencia)
    chips.push({ etiqueta: `${f.experiencia}+ años`, href: urlBusqueda(f, { experiencia: undefined, pagina: 1 }) });
  if (f.calificacion)
    chips.push({
      etiqueta: `${f.calificacion}+ estrellas`,
      href: urlBusqueda(f, { calificacion: undefined, pagina: 1 }),
    });
  return chips;
}

export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  await connection();
  const f = parseFiltros(await searchParams);
  const [catalogo, parroquias, resultado] = await Promise.all([getPublicCatalog(), listParishes(), searchWorkers(f)]);
  const chips = filtrosActivos(f, catalogo, parroquias);
  const masFiltros = [f.categoria, f.experiencia, f.calificacion].filter(Boolean).length;

  return (
    <>
      <PageHeader
        titulo={f.q ? `Resultados para «${f.q}»` : "Encuentra un trabajador"}
        descripcion="Solo aparecen trabajadores registrados, capacitados y habilitados por el GAD Municipalidad de Ambato."
      />

      <div className="px-4 sm:px-6">
        <FormularioAutoEnvio
          action="/buscar"
          label="Filtros de búsqueda"
          esperaAlEscribir={400}
          className="relative z-30 -mx-4 space-y-3 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:sticky lg:top-[4.75rem]"
        >
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-input bg-card px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30">
              <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span className="sr-only">Qué necesitas</span>
              <input
                name="q"
                type="search"
                defaultValue={f.q}
                maxLength={100}
                placeholder="Ej.: fuga de agua, pintar una casa"
                className="min-h-12 w-full min-w-0 bg-transparent text-base font-semibold outline-none placeholder:font-normal"
              />
            </label>
            <button type="submit" className={boton()}>
              Buscar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
            <Selector id="filtro-oficio" etiqueta="Oficio" name="oficio" defaultValue={f.oficio ?? ""}>
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
            </Selector>
            <Selector id="filtro-parroquia" etiqueta="Parroquia" name="parroquia" defaultValue={f.parroquia ?? ""}>
              <option value="">Todo el cantón</option>
              {(["URBANA", "RURAL"] as const).map((k) => (
                <optgroup key={k} label={k === "URBANA" ? "Parroquias urbanas" : "Parroquias rurales"}>
                  {parroquias
                    .filter((p) => p.kind === k)
                    .map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Selector>
            <label
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-2xl border border-input bg-card px-4 text-sm font-semibold whitespace-nowrap transition-colors hover:border-primary/40",
                "has-[:checked]:border-verde has-[:checked]:bg-verde/10",
              )}
            >
              <input
                type="checkbox"
                name="disponible"
                value="1"
                defaultChecked={f.disponible}
                className="h-5 w-5 accent-[var(--verde-fuerte)]"
              />
              Disponibles ahora
            </label>
            <details className="group md:relative">
              <summary
                className={cn(
                  boton({ variante: "secundario" }),
                  "w-full cursor-pointer list-none rounded-2xl [&::-webkit-details-marker]:hidden",
                )}
              >
                <SlidersHorizontal aria-hidden />
                Más filtros
                {masFiltros > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">
                    {masFiltros}
                  </span>
                )}
              </summary>
              <div className="absolute inset-x-4 z-40 mt-2 grid gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-elevada)] ring-1 ring-border sm:inset-x-6 md:right-0 md:left-auto md:w-80">
                <div>
                  <p className="mb-1.5 text-sm font-bold" aria-hidden>
                    Categoría
                  </p>
                  <Selector
                    id="filtro-categoria"
                    etiqueta="Categoría"
                    name="categoria"
                    defaultValue={f.categoria ?? ""}
                  >
                    <option value="">Todas las categorías</option>
                    {catalogo.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </Selector>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-bold" aria-hidden>
                    Experiencia
                  </p>
                  <Selector
                    id="filtro-experiencia"
                    etiqueta="Experiencia"
                    name="experiencia"
                    defaultValue={f.experiencia ?? ""}
                  >
                    <option value="">Cualquier experiencia</option>
                    <option value="2">2 años o más</option>
                    <option value="5">5 años o más</option>
                    <option value="10">10 años o más</option>
                  </Selector>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-bold" aria-hidden>
                    Calificación
                  </p>
                  <Selector
                    id="filtro-calificacion"
                    etiqueta="Calificación"
                    name="calificacion"
                    defaultValue={f.calificacion ?? ""}
                  >
                    <option value="">Cualquier calificación</option>
                    <option value="3">3 estrellas o más</option>
                    <option value="4">4 estrellas o más</option>
                  </Selector>
                </div>
                <noscript>
                  <button type="submit" className={boton({ className: "w-full" })}>
                    Aplicar filtros
                  </button>
                </noscript>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-sm text-muted-foreground" role="status">
              {resultado.total === 0 ? (
                "No encontramos trabajadores con esos criterios."
              ) : (
                <>
                  <strong className="font-bold text-foreground tabular-nums">{resultado.total}</strong>{" "}
                  {resultado.total === 1 ? "trabajador encontrado" : "trabajadores encontrados"}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-orden" className="text-sm text-muted-foreground">
                Ordenar por
              </label>
              <div className="relative">
                <select
                  id="filtro-orden"
                  name="orden"
                  defaultValue={f.orden ?? ""}
                  className="min-h-10 appearance-none rounded-xl bg-transparent pr-8 pl-2 text-sm font-bold outline-none hover:bg-secondary focus:ring-2 focus:ring-ring/30"
                >
                  <option value="">Más relevantes</option>
                  <option value="calificacion">Mejor calificados</option>
                  <option value="experiencia">Más experiencia</option>
                  <option value="nombre">Nombre</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </FormularioAutoEnvio>

        {chips.length > 0 && (
          <ul className="mt-1 flex flex-wrap items-center gap-2" aria-label="Filtros activos">
            {chips.map((c) => (
              <li key={c.href + c.etiqueta}>
                <Link
                  href={c.href}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary/10 py-1 pr-2.5 pl-3.5 text-sm font-semibold text-primary hover:bg-primary/15"
                  aria-label={`Quitar filtro ${c.etiqueta}`}
                >
                  {c.etiqueta}
                  <X className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            ))}
            <li>
              <Link href="/buscar" className="px-2 text-sm font-bold text-muted-foreground hover:text-foreground">
                Limpiar todo
              </Link>
            </li>
          </ul>
        )}

        <div className="mt-6 transition-opacity [form[data-pendiente]~&]:opacity-50">
          {resultado.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl superficie px-6 py-14 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-card text-muted-foreground shadow-[var(--shadow-suave)]">
                <SearchX className="h-8 w-8" aria-hidden />
              </span>
              <p className="text-lg font-bold">Prueba con otra palabra o quita algunos filtros</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Busca por el oficio («plomería») o por lo que necesitas arreglar («fuga de agua»).
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Link href="/oficios" className={boton({ variante: "secundario", tamano: "sm" })}>
                  Ver todos los oficios
                </Link>
                {hayFiltros(f) && (
                  <Link href="/buscar" className={boton({ tamano: "sm" })}>
                    Quitar filtros
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </div>
    </>
  );
}
