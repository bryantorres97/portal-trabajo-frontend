import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseUrl.replace(/^http/, "ws");
const cognitoDomain = (process.env.COGNITO_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

/**
 * CSP sin nonces para conservar el renderizado estático del portal público.
 * Fase 10: evaluar SRI experimental o nonces (docs/analysis/05-seguridad-auditoria.md).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Multimedia provisional desde Unsplash (ADR-009); se reemplaza por material oficial del GAD.
  "img-src 'self' blob: data: https://images.unsplash.com",
  "font-src 'self'",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  // Chrome aplica form-action también a redirecciones: el logout (POST → 303) termina en Cognito.
  `form-action 'self'${cognitoDomain ? ` https://${cognitoDomain}` : ""}`,
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
