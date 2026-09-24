import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/session-cookie";

/**
 * Proxy (antes "middleware" en Next < 16). Solo hace comprobaciones OPTIMISTAS:
 * si no hay cookie de sesión en rutas privadas, redirige al login.
 * La autorización real ocurre en el servidor (`src/server/auth`), nunca aquí.
 */
export function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const { pathname, search } = request.nextUrl;
  const esPrivada = pathname.startsWith("/cuenta") || pathname.startsWith("/admin");

  // /cuenta sin sesión muestra la pantalla de bienvenida/login (y errores de login), no redirige.
  if (esPrivada && pathname !== "/cuenta" && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/api/auth/login", request.url);
    login.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  // Excluye assets estáticos e imágenes optimizadas.
  matcher: ["/((?!_next/static|_next/image|images/|icon.png|robots.txt|sitemap.xml).*)"],
};
