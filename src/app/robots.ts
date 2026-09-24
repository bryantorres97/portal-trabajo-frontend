import type { MetadataRoute } from "next";

import { publicEnv } from "@/lib/env.public";

export default function robots(): MetadataRoute.Robots {
  // Solo producción debe indexarse; los demás ambientes se bloquean.
  const indexable = process.env.APP_ENV === "production";
  return {
    rules: indexable
      ? { userAgent: "*", allow: "/", disallow: ["/cuenta", "/admin", "/api/"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: indexable ? `${publicEnv.NEXT_PUBLIC_APP_URL}/sitemap.xml` : undefined,
  };
}
