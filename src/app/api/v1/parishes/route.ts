import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { listParishes } from "@/server/catalog/catalog";

/** GET /api/v1/parishes — parroquias del cantón Ambato (ubicación aproximada). */
export async function GET() {
  try {
    return NextResponse.json(
      { parishes: await listParishes() },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
