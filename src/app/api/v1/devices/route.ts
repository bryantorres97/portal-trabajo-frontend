import { NextResponse } from "next/server";
import { z } from "zod";

import { deviceSchema } from "@/server/domain/chat/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { registerDevice, unregisterDevice } from "@/server/notifications/notifications";

/** POST /api/v1/devices — `{ platform, token }` registra el token FCM del dispositivo (push). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    await registerDevice(user, await readJson(request, deviceSchema));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}

/** DELETE /api/v1/devices — `{ token }` deja de enviar push a ese dispositivo (p. ej. al cerrar sesión). */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { token } = await readJson(request, z.object({ token: z.string().min(20).max(4096) }));
    await unregisterDevice(user, token);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}
