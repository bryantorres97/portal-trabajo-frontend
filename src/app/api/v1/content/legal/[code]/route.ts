import { NextResponse } from "next/server";

import { DomainError } from "@/server/errors";
import { toProblem } from "@/server/http/api";
import { getLegalDocument } from "@/server/users/consents";

/**
 * GET /api/v1/content/legal/{code} — versión vigente de un documento legal (`TERMINOS` o
 * `PRIVACIDAD`) en markdown, para leerlo sin sesión (las mismas de /terminos y /privacidad).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/content/legal/[code]">) {
  try {
    const { code } = await ctx.params;
    const documento = await getLegalDocument(code.toUpperCase());
    if (!documento) throw new DomainError(404, "No hay un documento legal vigente con ese código");
    return NextResponse.json(
      {
        code: documento.code,
        version: documento.version,
        title: documento.title,
        content: documento.contentMd,
        publishedAt: documento.publishedAt,
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
