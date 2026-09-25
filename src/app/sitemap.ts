import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { publicEnv } from "@/lib/env.public";
import { logger } from "@/lib/logger";
import { parseFiltros } from "@/lib/busqueda";
import { getPublicServices } from "@/server/catalog/catalog";
import { searchWorkers } from "@/server/search/workers";

const PAGINAS_ESTATICAS = [
  "/",
  "/oficios",
  "/buscar",
  "/como-funciona",
  "/contratantes",
  "/trabajadores",
  "/contacto",
  "/privacidad",
  "/terminos",
];

/** Sitemap dinámico: páginas institucionales, oficios y perfiles de trabajadores habilitados. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const entradas: MetadataRoute.Sitemap = PAGINAS_ESTATICAS.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly",
  }));

  try {
    const oficios = await getPublicServices();
    entradas.push(...oficios.map((o) => ({ url: `${base}/oficios/${o.slug}`, changeFrequency: "daily" as const })));

    // Recorre todas las páginas de trabajadores habilitados (máx. 12 por página, tope de seguridad).
    for (let pagina = 1; pagina <= 400; pagina++) {
      const r = await searchWorkers(parseFiltros({ orden: "nombre", pagina: String(pagina) }));
      entradas.push(
        ...r.items.map((w) => ({ url: `${base}/trabajadores/${w.id}`, changeFrequency: "weekly" as const })),
      );
      if (pagina >= r.pages) break;
    }
  } catch (error) {
    logger.error("sitemap.datos_no_disponibles", { error });
  }
  return entradas;
}
