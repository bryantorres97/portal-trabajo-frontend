import { z } from "zod";

import { hasPermission } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { readWorkerPhoto } from "@/server/workers/public-profile";

/** GET /admin/trabajadores/{id}/foto?v=approved|pending — foto para el personal (incluida la pendiente de revisión). */
export async function GET(request: Request, ctx: RouteContext<"/admin/trabajadores/[id]/foto">) {
  const { id } = await ctx.params;
  const auth = await getCurrentAuth();
  if (!auth || auth.source !== "ENTRA" || !hasPermission(auth.user, "worker.read")) {
    return new Response("Acceso denegado", { status: 403 });
  }
  if (!z.uuid().safeParse(id).success) return new Response("No encontrado", { status: 404 });
  const variante = new URL(request.url).searchParams.get("v") === "pending" ? "pending" : "approved";
  const foto = await readWorkerPhoto(id, variante);
  if (!foto) return new Response("No encontrado", { status: 404 });
  return new Response(foto.bytes, {
    headers: { "Content-Type": foto.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
