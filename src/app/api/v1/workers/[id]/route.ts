import { NextResponse } from "next/server";

import { problem, toProblem } from "@/server/http/api";
import { getPublicWorker } from "@/server/search/workers";

/** GET /api/v1/workers/{id} — perfil público de un trabajador habilitado (sin datos privados). */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/workers/[id]">) {
  try {
    const { id } = await ctx.params;
    const worker = await getPublicWorker(id);
    if (!worker) return problem(404, "No encontrado", "El trabajador no existe o no está habilitado.");
    return NextResponse.json(worker, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  } catch (error) {
    return toProblem(error);
  }
}
