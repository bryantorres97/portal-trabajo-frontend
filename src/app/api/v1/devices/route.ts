import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { deviceSchema } from "@/server/domain/chat/schemas";
import { bajaDispositivoSchema } from "@/server/domain/notifications/schemas";
import { getCurrentAuth } from "@/server/auth/current-user";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { registerDevice, unregisterDevice } from "@/server/notifications/notifications";

/**
 * POST /api/v1/devices — `{ platform, token }` registra el token FCM del dispositivo (push).
 * Desde el navegador el token queda ligado a la sesión: al cerrarla deja de recibir push.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const bearer = (await headers()).get("authorization")?.startsWith("Bearer ");
    const sessionId = bearer ? null : ((await getCurrentAuth())?.sessionId ?? null);
    await registerDevice(user, await readJson(request, deviceSchema), sessionId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}

/**
 * DELETE /api/v1/devices — `{ token, keepAnonymous? }` deja de enviar push de la cuenta a ese
 * dispositivo. Con `keepAnonymous: true` (app móvil al cerrar sesión) sigue recibiendo los avisos
 * generales del GAD como dispositivo anónimo.
 */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    await unregisterDevice(user, await readJson(request, bajaDispositivoSchema));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}
