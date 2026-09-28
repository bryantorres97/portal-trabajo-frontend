import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getCurrentAuth, getRequestUser } from "@/server/auth/current-user";
import type { AppUser } from "@/server/auth/users";
import { listConversations } from "@/server/chat/chat";
import { toProblem } from "@/server/http/api";

/**
 * GET /api/v1/me/unread — resumen para el acceso directo a «Mensajes» (encabezado y barra
 * inferior de la web, pestaña de la app móvil). Sin sesión responde 200 con `signedIn: false`
 * para no ensuciar la consola de las páginas públicas. El personal del GAD (sesión de Entra) y
 * las cuentas bloqueadas no usan el chat: `chat: false`. Acepta cookie o `Authorization: Bearer`.
 */
export async function GET() {
  const sinCache = { headers: { "Cache-Control": "no-store" } };
  try {
    const { signedIn, chatUser } = await participante();
    if (!chatUser)
      return NextResponse.json({ signedIn, chat: false, unreadMessages: 0, unreadConversations: 0 }, sinCache);
    const conversaciones = await listConversations(chatUser);
    const conPendientes = conversaciones.filter((c) => c.unread > 0);
    return NextResponse.json(
      {
        signedIn: true,
        chat: true,
        userId: chatUser.id,
        unreadMessages: conPendientes.reduce((t, c) => t + c.unread, 0),
        unreadConversations: conPendientes.length,
      },
      sinCache,
    );
  } catch (error) {
    return toProblem(error);
  }
}

/** Usuario que puede tener conversaciones (cuenta ciudadana activa), si lo hay. */
async function participante(): Promise<{ signedIn: boolean; chatUser: AppUser | null }> {
  if ((await headers()).get("authorization")?.startsWith("Bearer ")) {
    // Un Bearer siempre es de Cognito (ciudadano); getRequestUser devuelve también cuentas bloqueadas.
    const user = await getRequestUser();
    return { signedIn: user !== null, chatUser: user?.status === "ACTIVO" ? user : null };
  }
  const auth = await getCurrentAuth();
  return { signedIn: auth !== null, chatUser: auth?.source === "COGNITO" ? auth.user : null };
}
