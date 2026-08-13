import { NextResponse } from "next/server";
import { getPublicSearchSuggestions } from "@server/convex/publicLibrary";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicSearchRead");
  if (rateLimited) {
    return rateLimited;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "8", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 80) : 8;

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const results = await getPublicSearchSuggestions(query, limit);

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
