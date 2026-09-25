import { NextResponse } from "next/server";

import { toProblem } from "@/server/http/api";
import { getPublicCatalog } from "@/server/catalog/catalog";

/** GET /api/v1/categories — catálogo público (categorías con sus oficios activos). */
export async function GET() {
  try {
    const categorias = await getPublicCatalog();
    return NextResponse.json(
      { categories: categorias },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    return toProblem(error);
  }
}
