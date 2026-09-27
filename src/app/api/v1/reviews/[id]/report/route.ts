import { NextResponse } from "next/server";

import { reportReviewSchema } from "@/server/domain/reviews/schemas";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";
import { apiChatUser } from "@/server/http/api-auth";
import { requestInfo } from "@/server/http/request-info";
import { reportReview } from "@/server/reviews/reviews";

/** POST /api/v1/reviews/{id}/report — `{ reasonCode, description? }`. No se denuncia la propia; 409 si ya hay una abierta. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/reviews/[id]/report">) {
  try {
    assertSameOrigin(request);
    const user = await apiChatUser();
    const { id } = await ctx.params;
    const reportId = await reportReview(
      user,
      id,
      await readJson(request, reportReviewSchema),
      requestInfo(request.headers),
    );
    return NextResponse.json({ id: reportId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toProblem(error);
  }
}
