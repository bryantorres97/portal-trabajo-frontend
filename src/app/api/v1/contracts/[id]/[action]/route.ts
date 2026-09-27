import { NextResponse } from "next/server";

import {
  acceptContract,
  cancelContract,
  counterContract,
  declineContract,
  disputeContract,
  progressContract,
  withdrawDispute,
} from "@/server/contracts/contracts";
import {
  acceptSchema,
  cancelSchema,
  counterSchema,
  declineSchema,
  disputeSchema,
} from "@/server/domain/contracts/schemas";
import { DomainError } from "@/server/errors";
import { reviewSchema } from "@/server/domain/reviews/schemas";
import { assertSameOrigin, problem, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";
import { getContractReviews, saveReview } from "@/server/reviews/reviews";

type Ctx = RouteContext<"/api/v1/contracts/[id]/[action]">;

/**
 * Acciones sobre una contratación (solo sus partes; 404 para terceros):
 *
 * | POST …/terms    | `{ baseVersion, terms }` | contrapropuesta o modificación (409 si la base es obsoleta) |
 * | POST …/accept   | `{ version, contentHash }` | aceptar la versión vigente (409 si cambió) |
 * | POST …/reject   | `{ version, note? }` | rechazar la versión vigente |
 * | POST …/withdraw | `{ version, note? }` | retirar la versión que envié |
 * | POST …/cancel   | `{ reason }` | cancelar antes de iniciar |
 * | POST …/start · …/complete · …/confirm | — | inicio (trabajador), fin (trabajador), confirmación (cliente) |
 * | POST …/dispute  | `{ reasonCode, description }` | abrir disputa (crea una denuncia para el GAD) |
 * | DELETE …/dispute | — | retirar la disputa que abrí |
 * | POST …/review   | `{ rating, comment? }` | calificar a la otra parte (finalizada) o editar dentro de 7 días |
 * | GET …/review    | — | mi calificación y la recibida (si puedo verla, RN-20) |
 */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const user = await apiChatUser();
    const { id, action } = await ctx.params;
    if (action !== "review") throw new DomainError(404, "Acción no encontrada");
    return NextResponse.json(await getContractReviews(user, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id, action } = await ctx.params;
    const info = requestInfo(request.headers);

    switch (action) {
      case "terms": {
        const version = await counterContract(user, id, await readJson(request, counterSchema), info);
        return NextResponse.json({ version }, { status: 201, headers: { "Cache-Control": "no-store" } });
      }
      case "accept":
        return estado(await acceptContract(user, id, await readJson(request, acceptSchema), info));
      case "reject":
      case "withdraw":
        return estado(
          await declineContract(
            user,
            id,
            action === "reject" ? "REJECT" : "WITHDRAW",
            await readJson(request, declineSchema),
            info,
          ),
        );
      case "cancel":
        return estado(await cancelContract(user, id, await readJson(request, cancelSchema), info));
      case "start":
      case "complete":
      case "confirm":
        return estado(
          await progressContract(
            user,
            id,
            action === "start" ? "START" : action === "complete" ? "COMPLETE" : "CONFIRM",
            info,
          ),
        );
      case "dispute": {
        const reportId = await disputeContract(user, id, await readJson(request, disputeSchema), info);
        return NextResponse.json({ reportId }, { status: 201, headers: { "Cache-Control": "no-store" } });
      }
      case "review": {
        const reviewId = await saveReview(user, id, await readJson(request, reviewSchema), info);
        return NextResponse.json({ id: reviewId }, { headers: { "Cache-Control": "no-store" } });
      }
      default:
        throw new DomainError(404, "Acción no encontrada");
    }
  } catch (error) {
    return toProblem(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id, action } = await ctx.params;
    if (action !== "dispute") return problem(405, "Método no permitido");
    return estado(await withdrawDispute(user, id, requestInfo(request.headers)));
  } catch (error) {
    return toProblem(error);
  }
}

function estado(status: string) {
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
