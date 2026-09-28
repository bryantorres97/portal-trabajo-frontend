import { NextResponse } from "next/server";

import { markNotificationsSchema } from "@/server/domain/chat/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiUser } from "@/server/http/api-auth";
import { listNotifications, markNotificationsRead } from "@/server/notifications/notifications";

/** GET /api/v1/notifications — últimas notificaciones in-app y cantidad sin leer. */
export async function GET() {
  try {
    const user = await apiUser();
    return NextResponse.json(await listNotifications(user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/** POST /api/v1/notifications — `{ ids? }` marca como leídas (todas si no se indican ids). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiUser();
    const input = await readJson(request, markNotificationsSchema);
    return NextResponse.json({ updated: await markNotificationsRead(user, input) });
  } catch (error) {
    return toProblem(error);
  }
}
