import { z } from "zod";

import { readPublicWorkerPhoto } from "@/server/workers/public-profile";

/**
 * GET /api/v1/workers/{id}/photo — foto APROBADA de un trabajador HABILITADO. El archivo vive en
 * el bucket privado y lo sirve el servidor; si el trabajador deja de estar habilitado, responde 404.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/workers/[id]/photo">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("No encontrado", { status: 404 });
  const foto = await readPublicWorkerPhoto(id);
  if (!foto) return new Response("No encontrado", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  return new Response(foto.bytes, {
    headers: {
      "Content-Type": foto.type,
      // Corto: una suspensión debe ocultar también la foto rápidamente.
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
