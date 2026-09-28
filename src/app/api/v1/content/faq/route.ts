import { NextResponse } from "next/server";

import { listPublicFaq } from "@/server/content/content";
import { toProblem } from "@/server/http/api";

/**
 * GET /api/v1/content/faq — preguntas frecuentes publicadas (las mismas de /preguntas-frecuentes),
 * con su audiencia (`GENERAL`, `CLIENTES`, `TRABAJADORES`) y la respuesta en markdown.
 */
export async function GET() {
  try {
    return NextResponse.json(
      { items: await listPublicFaq() },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
