import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { BuscadorOficios, type OficioResumen } from "@/components/site/BuscadorOficios";
import { Section } from "@/components/site/SiteShell";
import { pasos } from "@/content/site";
import { formatearTarifa } from "@/lib/busqueda";
import { logger } from "@/lib/logger";
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

export default async function InicioPage() {
  await connection();
  const oficios = await cargarOficios();

  return (
    <>
      <BuscadorOficios oficios={oficios} />

      <Section titulo="Cómo funciona">
        <ol className="grid gap-3 sm:grid-cols-3">
          {pasos.map((paso) => (
            <li key={paso.numero} className="tarjeta p-5">
              <span className="texto-marca font-display text-3xl font-extrabold">{paso.numero}</span>
              <h3 className="mt-2 text-base font-bold">{paso.titulo}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{paso.detalle}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <div className="tarjeta p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-lg font-extrabold">¿Ofreces un servicio?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Regístrate como trabajador de oficio en un punto de atención municipal.
            </p>
          </div>
          <Link
            href="/trabajadores"
            className="mt-4 flex min-h-13 shrink-0 items-center justify-center rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground sm:mt-0"
          >
            Cómo registrarme
          </Link>
        </div>
      </Section>
    </>
  );
}
