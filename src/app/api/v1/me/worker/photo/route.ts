import { NextResponse } from "next/server";

import { DomainError } from "@/server/errors";
import { assertSameOrigin, toProblem } from "@/server/http/api";
import { apiConsentedUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";
import { getOwnWorker, proposeOwnPhoto } from "@/server/workers/public-profile";

/**
 * POST /api/v1/me/worker/photo — el trabajador propone una foto nueva para su perfil público:
 * `multipart/form-data` con `file` (JPG, PNG o WEBP; 4 MB). Queda pendiente hasta que el GAD la
 * apruebe (`photo.hasPending`). Responde la ficha propia actualizada.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiConsentedUser();
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
      throw new DomainError(400, "Envía la foto como multipart/form-data en el campo «file».");
    }
    const form = await request.formData().catch(() => {
      throw new DomainError(400, "Formulario mal formado");
    });
    await proposeOwnPhoto(user, form.get("file"), requestInfo(request.headers));
    return NextResponse.json(await getOwnWorker(user.id), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
