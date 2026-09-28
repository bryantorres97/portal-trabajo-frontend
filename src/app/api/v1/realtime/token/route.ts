import { NextResponse } from "next/server";

import { isRealtimeConfigured } from "@/lib/env";
import { assertSameOrigin, problem, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { issueRealtimeToken } from "@/server/realtime/token";

/**
 * POST /api/v1/realtime/token — JWT de 10 minutos para suscribirse a los canales privados de
 * Realtime propios (`user:{id}` y `conversation:{id}` donde participa). ADR-004.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    if (!isRealtimeConfigured()) {
      return problem(503, "Tiempo real no disponible", "Falta configurar REALTIME_JWT_PRIVATE_KEY.");
    }
    const t = await issueRealtimeToken(user.id);
    return NextResponse.json({ ...t, userId: user.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
