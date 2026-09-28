import type { MetadataRoute } from "next";

/** Manifiesto de la aplicación web (instalación en el teléfono y nombre en el sistema). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Llankana — Trabajo verificado en Ambato",
    short_name: "Llankana",
    description:
      "Plataforma municipal del GAD Municipalidad de Ambato para encontrar trabajadores de oficio registrados, capacitados y habilitados por el Municipio.",
    lang: "es-EC",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf9f4",
    theme_color: "#fbf9f4",
    icons: [
      { src: "/images/marca/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/images/marca/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/images/marca/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
