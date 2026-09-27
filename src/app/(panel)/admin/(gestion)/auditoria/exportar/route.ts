import { NextResponse } from "next/server";

import { hasPermission } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { STAFF_SIGNIN_PATH } from "@/server/auth/entra";
import { parseRango } from "@/server/domain/panel/schemas";
import { toProblem } from "@/server/http/api";
import { requestInfo } from "@/server/http/request-info";
import { exportAudit } from "@/server/panel/audit";

/** GET /admin/auditoria/exportar?desde&hasta&accion&actor&recurso — CSV de la auditoría (audit.read + data.export). */
export async function GET(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth || auth.source !== "ENTRA" || !hasPermission(auth.user, "admin.access")) {
    return NextResponse.redirect(new URL(`${STAFF_SIGNIN_PATH}?returnTo=%2Fadmin%2Fauditoria`, request.url));
  }
  try {
    const sp = Object.fromEntries(new URL(request.url).searchParams);
    const { nombre, csv } = await exportAudit(
      auth.user,
      { ...parseRango(sp), accion: sp.accion, actor: sp.actor, recurso: sp.recurso, recursoId: sp.recursoId },
      requestInfo(request.headers),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toProblem(error);
  }
}
