import { NextResponse } from "next/server";

import { profileProposalSchema } from "@/server/domain/workers/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiConsentedUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";
import { getOwnWorker, proposeOwnProfile } from "@/server/workers/public-profile";

/**
 * POST /api/v1/me/worker/proposal — el trabajador propone su descripción pública y su nota de
 * horario `{ publicBio?, availabilityNote? }`. Se publican cuando el GAD las aprueba (`proposal`).
 * Responde la ficha propia actualizada.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiConsentedUser();
    const input = await readJson(request, profileProposalSchema);
    await proposeOwnProfile(user, input, requestInfo(request.headers));
    return NextResponse.json(await getOwnWorker(user.id), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
