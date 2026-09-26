import { NextResponse } from "next/server";

import { availabilitySchema } from "@/server/domain/workers/schemas";
import { DomainError } from "@/server/errors";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiConsentedUser, apiUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";
import { getOwnWorker, setOwnAvailability } from "@/server/workers/public-profile";

/** GET /api/v1/me/worker — ficha de trabajador vinculada a la cuenta (404 si no hay). */
export async function GET() {
  try {
    const user = await apiUser();
    const worker = await getOwnWorker(user.id);
    if (!worker) throw new DomainError(404, "La cuenta no está vinculada a una ficha de trabajador");
    return NextResponse.json(worker, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/** PATCH /api/v1/me/worker — disponibilidad `{ "isAvailable": boolean }`. */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiConsentedUser();
    const input = await readJson(request, availabilitySchema);
    await setOwnAvailability(user, input, requestInfo(request.headers));
    return NextResponse.json(await getOwnWorker(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
