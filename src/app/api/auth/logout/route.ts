import { NextResponse, type NextRequest } from "next/server";

import { isAuthConfigured, isStaffAuthConfigured } from "@/lib/env";
import { logAudit } from "@/server/audit/log";
import { buildLogoutUrl } from "@/server/auth/cognito";
import { buildStaffLogoutUrl } from "@/server/auth/entra";
import { destroySession } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { requestInfo } from "@/server/http/request-info";

/**
 * Cierra la sesión: revoca la sesión local y el refresh token, borra la cookie y
 * redirige al logout del proveedor con el que se abrió (Cognito o Entra ID).
 * Solo POST (un GET permitiría cerrar sesiones vía enlaces de terceros).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const configurado = isAuthConfigured() || isStaffAuthConfigured();
  const cerrada = configurado ? await destroySession(request.cookies.get(SESSION_COOKIE)?.value) : null;
  if (cerrada) {
    await logAudit({
      action: "USER_LOGOUT",
      actorId: cerrada.userId,
      metadata: { provider: cerrada.source },
      ...requestInfo(request.headers),
    });
  }

  let destino = new URL("/", request.url).toString();
  if (cerrada?.source === "ENTRA" && isStaffAuthConfigured()) destino = buildStaffLogoutUrl();
  else if (cerrada?.source !== "ENTRA" && isAuthConfigured()) destino = buildLogoutUrl();

  // 303: el navegador sigue la redirección con GET.
  const response = NextResponse.redirect(destino, 303);
  response.cookies.delete(SESSION_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
