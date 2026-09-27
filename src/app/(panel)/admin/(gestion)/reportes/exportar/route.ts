import { NextResponse } from "next/server";

import { hasPermission } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { STAFF_SIGNIN_PATH } from "@/server/auth/entra";
import { parseRango, TIPOS_REPORTE, type TipoReporte } from "@/server/domain/panel/schemas";
import { problem, toProblem } from "@/server/http/api";
import { requestInfo } from "@/server/http/request-info";
import { exportReport } from "@/server/panel/reports";

/** GET /admin/reportes/exportar?tipo&desde&hasta&estado — CSV del reporte (data.export, auditado). */
export async function GET(request: Request) {
  const auth = await getCurrentAuth();
  if (!auth || auth.source !== "ENTRA" || !hasPermission(auth.user, "admin.access")) {
    return NextResponse.redirect(new URL(`${STAFF_SIGNIN_PATH}?returnTo=%2Fadmin%2Freportes`, request.url));
  }
  try {
    const sp = Object.fromEntries(new URL(request.url).searchParams);
    if (!TIPOS_REPORTE.includes(sp.tipo as TipoReporte)) return problem(404, "No encontrado", "Reporte desconocido.");
    const { nombre, csv } = await exportReport(
      auth.user,
      sp.tipo as TipoReporte,
      { ...parseRango(sp), estado: sp.estado ?? null },
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
