import { NextResponse, type NextRequest } from "next/server";

import { parseFiltros } from "@/lib/busqueda";
import { toProblem } from "@/server/http/api";
import { searchWorkers } from "@/server/search/workers";

/**
 * GET /api/v1/workers — búsqueda pública de trabajadores habilitados.
 * Parámetros (los mismos que /buscar): q, categoria, oficio, parroquia, disponible=1,
 * experiencia, calificacion, orden (relevancia|calificacion|experiencia|nombre), pagina.
 */
export async function GET(request: NextRequest) {
  try {
    const resultado = await searchWorkers(parseFiltros(request.nextUrl.searchParams));
    return NextResponse.json(resultado, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    return toProblem(error);
  }
}
