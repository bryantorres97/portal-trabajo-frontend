import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/session-cookie";

/**
 * Proxy (antes "middleware" en Next < 16). Solo hace comprobaciones OPTIMISTAS:
 * si no hay cookie de sesión en rutas privadas, redirige al login (ciudadano en /cuenta,
 * del personal con Entra ID en /admin).
 * La autorización real ocurre en el servidor (`src/server/auth`), nunca aquí.
 */
export function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const { pathname, search } = request.nextUrl;
  const esAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const esPrivada = esAdmin || pathname.startsWith("/cuenta");
  // /cuenta y /admin/ingresar sin sesión muestran su pantalla de ingreso (y los errores), no redirigen.
  const esIngreso = pathname === "/cuenta" || pathname === "/admin/ingresar";

  if (esPrivada && !esIngreso && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL(esAdmin ? "/admin/ingresar" : "/api/auth/login", request.url);
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
