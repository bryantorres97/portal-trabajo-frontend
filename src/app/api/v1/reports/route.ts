import { NextResponse } from "next/server";

import { createReportSchema } from "@/server/domain/reports/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";
import { createReport, listMyReports } from "@/server/reports/reports";

/** GET /api/v1/reports — «Mis denuncias» (estado y mensaje genérico para el denunciante). */
export async function GET() {
  try {
    const user = await apiChatUser();
    return NextResponse.json({ items: await listMyReports(user) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/**
 * POST /api/v1/reports — `{ targetType: WORKER|CLIENT|CONVERSATION, targetId, reasonCode, description }`.
 * Mensajes, reseñas y contrataciones se denuncian en sus propias rutas. 409 si ya hay una abierta;
 * 429 al superar el límite diario.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const id = await createReport(user, await readJson(request, createReportSchema), requestInfo(request.headers));
    return NextResponse.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
