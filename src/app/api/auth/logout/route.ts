import { NextResponse, type NextRequest } from "next/server";

import { isAuthConfigured } from "@/lib/env";
import { logAudit } from "@/server/audit/log";
import { buildLogoutUrl } from "@/server/auth/cognito";
import { destroySession } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { requestInfo } from "@/server/http/request-info";

/**
 * Cierra la sesión: revoca la sesión local y el refresh token, borra la cookie y
 * redirige al logout de Cognito. Solo POST (un GET permitiría cerrar sesiones vía enlaces de terceros).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const destino = isAuthConfigured() ? buildLogoutUrl() : new URL("/", request.url).toString();
  const userId = isAuthConfigured() ? await destroySession(request.cookies.get(SESSION_COOKIE)?.value) : null;
  if (userId) await logAudit({ action: "USER_LOGOUT", actorId: userId, ...requestInfo(request.headers) });

  // 303: el navegador sigue la redirección con GET.
  const response = NextResponse.redirect(destino, 303);
  response.cookies.delete(SESSION_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
