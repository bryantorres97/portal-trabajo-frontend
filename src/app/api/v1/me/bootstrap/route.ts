import { NextResponse } from "next/server";

import { isAuthConfigured } from "@/lib/env";
import { AuthError } from "@/server/auth/authorize";
import { bootstrapMobileUser } from "@/server/auth/mobile";
import { mobileBootstrapSchema } from "@/server/domain/users/schemas";
import { problem, readJson, toProblem } from "@/server/http/api";
import { requestInfo } from "@/server/http/request-info";
import { buildMe } from "@/server/users/me";

/**
 * POST /api/v1/me/bootstrap — primer ingreso (o reingreso) desde la app móvil.
 * `Authorization: Bearer <access token>` + `{ idToken }` del mismo inicio de sesión.
 * 201 si la cuenta se creó, 200 si ya existía; responde lo mismo que `GET /me` más `created`.
 */
export async function POST(request: Request) {
  try {
    if (!isAuthConfigured()) return problem(503, "Servicio no disponible", "El inicio de sesión no está configurado.");
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new AuthError(401, "Envía el access token en Authorization: Bearer.");
    }
    const input = await readJson(request, mobileBootstrapSchema);
    const { user, created } = await bootstrapMobileUser(
      authorization.slice("Bearer ".length).trim(),
      input,
      requestInfo(request.headers),
    );
    return NextResponse.json(
      { created, ...(await buildMe(user)) },
      { status: created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
