import { NextResponse } from "next/server";

import { preferenciasSchema } from "@/server/domain/notifications/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiUser } from "@/server/http/api-auth";
import { getNotificationPreferences, setNotificationPreferences } from "@/server/notifications/notifications";

/** GET /api/v1/me/preferences — `{ pushAnnouncements }`: si acepta avisos del GAD por push. */
export async function GET() {
  try {
    const user = await apiUser();
    return NextResponse.json(await getNotificationPreferences(user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

/** PUT /api/v1/me/preferences — `{ pushAnnouncements: boolean }`. No afecta a los avisos del chat ni de contrataciones. */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiUser();
    const prefs = await setNotificationPreferences(user, await readJson(request, preferenciasSchema));
    return NextResponse.json(prefs, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
