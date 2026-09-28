import { NextResponse } from "next/server";

import { apiUser } from "@/server/http/api-auth";
import { assertSameOrigin, toProblem } from "@/server/http/api";
import { requestInfo } from "@/server/http/request-info";
import { acceptCurrentConsents, getCurrentLegalDocuments, getPendingConsents } from "@/server/users/consents";

/** GET /api/v1/me/consents — documentos vigentes y cuáles faltan por aceptar. */
export async function GET() {
  try {
    const user = await apiUser();
    const [vigentes, pendientes] = await Promise.all([getCurrentLegalDocuments(), getPendingConsents(user.id)]);
    const faltan = new Set(pendientes.map((d) => d.code));
    return NextResponse.json(
      {
        documents: vigentes.map((d) => ({
          code: d.code,
          version: d.version,
          title: d.title,
          content: d.contentMd,
          accepted: !faltan.has(d.code),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}

/** POST /api/v1/me/consents — acepta todas las versiones vigentes pendientes. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiUser();
    const accepted = await acceptCurrentConsents(user.id, requestInfo(request.headers));
    return NextResponse.json({ accepted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
