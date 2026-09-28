import { NextResponse } from "next/server";
import { z } from "zod";

import { hasPermission } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { STAFF_SIGNIN_PATH } from "@/server/auth/entra";
import { toProblem } from "@/server/http/api";
import { requestInfo } from "@/server/http/request-info";
import { documentAccessUrl } from "@/server/workers/documents";

/**
 * GET /admin/trabajadores/{id}/documentos/{docId} — redirige a una URL firmada de 5 minutos del
 * bucket privado. Solo personal (sesión de Entra) con permiso; cada acceso queda auditado.
 */
export async function GET(request: Request, ctx: RouteContext<"/admin/trabajadores/[id]/documentos/[docId]">) {
  const { id, docId } = await ctx.params;
  const auth = await getCurrentAuth();
  if (!auth || auth.source !== "ENTRA" || !hasPermission(auth.user, "admin.access")) {
    const volver = new URL(request.url).pathname;
    return NextResponse.redirect(new URL(`${STAFF_SIGNIN_PATH}?returnTo=${encodeURIComponent(volver)}`, request.url));
  }
  try {
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(docId).success) {
      return new NextResponse("No encontrado", { status: 404 });
    }
    const url = await documentAccessUrl(auth.user, id, docId, requestInfo(request.headers));
    return NextResponse.redirect(url, {
      status: 303,
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    return toProblem(error);
  }
}
