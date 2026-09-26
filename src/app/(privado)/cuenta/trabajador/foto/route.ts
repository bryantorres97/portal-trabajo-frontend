import { getCurrentAuth } from "@/server/auth/current-user";
import { getOwnWorker, readWorkerPhoto } from "@/server/workers/public-profile";

/** GET /cuenta/trabajador/foto — foto aprobada del propio trabajador (aunque aún no esté habilitado). */
export async function GET() {
  const auth = await getCurrentAuth();
  if (!auth || auth.source !== "COGNITO") return new Response("Acceso denegado", { status: 403 });
  const w = await getOwnWorker(auth.user.id);
  const foto = w ? await readWorkerPhoto(w.id, "approved") : null;
  if (!foto) return new Response("No encontrado", { status: 404 });
  return new Response(foto.bytes, {
    headers: { "Content-Type": foto.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
