import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { TIPOS_OBJETIVO } from "@/server/domain/reports/state-machine";
import { toProblem } from "@/server/http/api";
import { listReportReasons } from "@/server/reports/reports";

const consultaSchema = z.object({ targetType: z.enum(TIPOS_OBJETIVO).optional() });

/**
 * GET /api/v1/report-reasons?targetType= — motivos de denuncia activos, en el orden del panel.
 * Sin `targetType` devuelve los de todos los tipos (perfil, cliente, conversación, mensaje,
 * reseña y contratación). Público: los motivos no son datos personales.
 */
export async function GET(request: NextRequest) {
  try {
    const { targetType } = consultaSchema.parse({
      targetType: request.nextUrl.searchParams.get("targetType") ?? undefined,
    });
    const tipos = targetType ? [targetType] : TIPOS_OBJETIVO;
    const porTipo = await Promise.all(
      tipos.map(async (tipo) => (await listReportReasons(tipo)).map((r) => ({ targetType: tipo, ...r }))),
    );
    return NextResponse.json(
      { items: porTipo.flat() },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
