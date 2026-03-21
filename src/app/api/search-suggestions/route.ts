import { NextResponse } from "next/server";
import { getPublicSearchMatches } from "@server/convex/publicLibrary";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "8", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 20) : 8;

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const results = await getPublicSearchMatches(query, limit);

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
