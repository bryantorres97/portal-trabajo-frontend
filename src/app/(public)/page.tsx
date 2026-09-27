import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";

import { BuscadorOficios, type OficioResumen } from "@/components/site/BuscadorOficios";
import { boton } from "@/components/ui/boton";
import { pasos } from "@/content/site";
import { formatearTarifa } from "@/lib/busqueda";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { getPublicServices } from "@/server/catalog/catalog";

export const metadata: Metadata = {
  title: { absolute: "Buscar un profesional en Ambato | Acolita.App" },
  description:
    "Busca el oficio que necesitas —albañilería, plomería, electricidad, carpintería, cerrajería y más— con trabajadores habilitados por el GAD Municipalidad de Ambato.",
};

async function cargarOficios(): Promise<OficioResumen[]> {
  try {
    return (await getPublicServices()).map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      imagePath: s.imagePath,
      tarifa: formatearTarifa(s.priceMin, s.priceMax, s.priceUnit),
      enabledWorkers: s.enabledWorkers,
    }));
  } catch (error) {
    // Si la base no responde, el inicio sigue funcionando (el buscador lleva a /buscar).
    logger.error("inicio.catalogo_no_disponible", { error });
    return [];
  }
}

const coloresPaso = ["bg-verde", "bg-azul", "bg-magenta"] as const;

export default async function InicioPage() {
  await connection();
  const oficios = await cargarOficios();

  return (
    <>
      <BuscadorOficios oficios={oficios} />

      <section className="px-4 py-12 sm:px-6" aria-labelledby="titulo-pasos">
        <h2 id="titulo-pasos" className="text-2xl font-extrabold sm:text-3xl">
          Cómo funciona
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Cada trabajador pasa por el Municipio antes de aparecer aquí. Tú solo buscas, conversas y acuerdas.
        </p>
        <ol className="relative mt-8 grid gap-8 md:grid-cols-3 md:gap-6">
          <span
            className="absolute top-6 right-[16%] left-[16%] hidden h-0.5 barra-marca opacity-40 md:block"
            aria-hidden
          />
          {pasos.map((paso, i) => (
            <li key={paso.numero} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
              <span
                className={cn(
                  "relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-lg font-extrabold text-white shadow-[var(--shadow-suave)]",
                  coloresPaso[i % coloresPaso.length],
                )}
                aria-hidden
              >
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-bold">{paso.titulo}</h3>
                <p className="mt-1 leading-relaxed text-muted-foreground md:mx-auto md:max-w-xs">{paso.detalle}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/como-funciona" className="mt-8 inline-flex items-center gap-1 font-bold text-primary">
          Conoce el proceso completo <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      <section className="grid gap-4 px-4 py-8 sm:px-6 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-3xl bg-primary p-7 text-primary-foreground sm:p-9">
          <h2 className="text-2xl font-extrabold">¿Necesitas un trabajo en casa?</h2>
          <p className="mt-2 max-w-sm text-primary-foreground/90">
            Encuentra a alguien habilitado cerca de ti y conversa sin compartir tu teléfono.
          </p>
          <Link href="/buscar" className={cn(boton({ variante: "claro", tamano: "lg" }), "mt-6")}>
            Buscar trabajadores
          </Link>
        </div>
        <div className="relative overflow-hidden rounded-3xl bg-verde/15 p-7 sm:p-9">
          <h2 className="text-2xl font-extrabold">¿Ofreces un oficio?</h2>
          <p className="mt-2 max-w-sm text-foreground/85">
            Regístrate en un punto de atención municipal y recibe clientes desde la plataforma.
          </p>
          <Link href="/trabajadores" className={cn(boton({ variante: "secundario", tamano: "lg" }), "mt-6")}>
            Cómo registrarme
          </Link>
        </div>
      </section>
    </>
  );
}
