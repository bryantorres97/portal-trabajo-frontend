import { NextResponse } from "next/server";

import { getCurrentAuth } from "@/server/auth/current-user";
import { listActiveSessions, revokeUserSessions } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/session-cookie";
import { apiUser } from "@/server/http/api-auth";
import { assertSameOrigin, toProblem } from "@/server/http/api";

/** GET /api/v1/me/sessions — sesiones web activas del usuario. */
export async function GET() {
  try {
    const user = await apiUser();
    const actual = await getCurrentAuth();
    const sessions = await listActiveSessions(user.id, actual?.sessionId);
    return NextResponse.json(
      { sessions: sessions.map(({ ip: _ip, ...s }) => s) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}

/** DELETE /api/v1/me/sessions — cierra todas las sesiones del portal y revoca los refresh tokens. */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiUser();
    const revoked = await revokeUserSessions(user.id);
    const response = NextResponse.json({ revoked }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (error) {
    return toProblem(error);
  }
}
