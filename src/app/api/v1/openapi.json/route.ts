import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { buildOpenApiDocument } from "@/server/http/openapi/document";

let documento: ReturnType<typeof buildOpenApiDocument> | undefined;

/** GET /api/v1/openapi.json — contrato OpenAPI 3.1 de la API (web y app móvil). */
export async function GET() {
  try {
    documento ??= buildOpenApiDocument();
    return NextResponse.json(documento, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    return toProblem(error);
  }
}
