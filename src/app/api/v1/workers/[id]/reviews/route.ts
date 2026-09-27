import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { listPublicWorkerReviews } from "@/server/reviews/reviews";

/**
 * GET /api/v1/workers/{id}/reviews?page= — reseñas públicas (del cliente al trabajador, publicadas).
 * Las calificaciones que reciben los clientes nunca se exponen aquí (RN-20).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/workers/[id]/reviews">) {
  try {
    const { id } = await ctx.params;
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    return NextResponse.json(await listPublicWorkerReviews(id, page), {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
    });
  } catch (error) {
    return toProblem(error);
  }
}
