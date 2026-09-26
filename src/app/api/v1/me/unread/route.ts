import { NextResponse } from "next/server";

import { getCurrentAuth } from "@/server/auth/current-user";
import { listConversations } from "@/server/chat/chat";
import { toProblem } from "@/server/http/api";

/**
 * GET /api/v1/me/unread — resumen para el acceso directo a «Mensajes» (encabezado y barra
 * inferior). Sin sesión responde 200 con `signedIn: false` para no ensuciar la consola de las
 * páginas públicas. El personal del GAD (sesión de Entra) no usa el chat: `chat: false`.
 */
export async function GET() {
  const sinCache = { headers: { "Cache-Control": "no-store" } };
  try {
    const auth = await getCurrentAuth();
    if (!auth)
      return NextResponse.json({ signedIn: false, chat: false, unreadMessages: 0, unreadConversations: 0 }, sinCache);
    if (auth.source !== "COGNITO") {
      return NextResponse.json({ signedIn: true, chat: false, unreadMessages: 0, unreadConversations: 0 }, sinCache);
    }
    const conversaciones = await listConversations(auth.user);
    const conPendientes = conversaciones.filter((c) => c.unread > 0);
    return NextResponse.json(
      {
        signedIn: true,
        chat: true,
        userId: auth.user.id,
        unreadMessages: conPendientes.reduce((t, c) => t + c.unread, 0),
        unreadConversations: conPendientes.length,
      },
      sinCache,
    );
  } catch (error) {
    return toProblem(error);
  }
}
