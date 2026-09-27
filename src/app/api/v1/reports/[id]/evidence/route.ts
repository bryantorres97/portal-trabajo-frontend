import { NextResponse } from "next/server";

import { evidenceNoteSchema } from "@/server/domain/reports/schemas";
import { DomainError } from "@/server/errors";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { addReportFile, addReportNote } from "@/server/reports/reports";

/**
 * POST /api/v1/reports/{id}/evidence — el denunciante aporta información:
 *   `application/json` `{ note }` o `multipart/form-data` con `file` (PDF, JPG, PNG o WEBP; 4 MB; hasta 5).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/reports/[id]/evidence">) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id } = await ctx.params;
    const tipo = request.headers.get("content-type") ?? "";
    let evidenceId: string;
    if (tipo.includes("multipart/form-data")) {
      const form = await request.formData().catch(() => {
        throw new DomainError(400, "Formulario mal formado");
      });
      evidenceId = await addReportFile(user, id, form.get("file"));
    } else {
      evidenceId = await addReportNote(user, id, await readJson(request, evidenceNoteSchema));
    }
    return NextResponse.json({ id: evidenceId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
