import { NextResponse } from "next/server";

import { dispositivoAnonimoSchema } from "@/server/domain/notifications/schemas";
import { readJson, toProblem } from "@/server/http/api";
import { requestInfo } from "@/server/http/request-info";
import { registerAnonymousDevice } from "@/server/notifications/notifications";

/**
 * POST /api/v1/devices/anonymous — `{ platform: "ANDROID" | "IOS", token }` registra la app
 * instalada sin sesión para recibir los avisos del GAD dirigidos a «todos los dispositivos».
 * Sin cookies (no aplica CSRF): FCM valida el token y hay un límite por IP.
 */
export async function POST(request: Request) {
  try {
    await registerAnonymousDevice(await readJson(request, dispositivoAnonimoSchema), requestInfo(request.headers).ip);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}
