import { BandejaMensajes } from "@/components/chat/BandejaMensajes";
import { getCurrentAuth } from "@/server/auth/current-user";
import { listConversations } from "@/server/chat/chat";
import { getOwnWorker } from "@/server/workers/public-profile";

/**
 * Bandeja compartida por /mensajes, /mensajes/[id] y /mensajes/nuevo. La autenticación la exige
 * cada página (así el regreso tras el login conserva la ruta exacta); sin sesión solo se muestra
 * el contenido de la página, que redirige al ingreso.
 */
export default async function MensajesLayout({ children }: LayoutProps<"/mensajes">) {
  const auth = await getCurrentAuth();
  if (!auth || auth.source !== "COGNITO") return children;
  const [conversaciones, trabajador] = await Promise.all([listConversations(auth.user), getOwnWorker(auth.user.id)]);
  return (
    <BandejaMensajes conversaciones={conversaciones} esTrabajador={!!trabajador}>
      {children}
    </BandejaMensajes>
  );
}
