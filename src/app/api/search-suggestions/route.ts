import { NextResponse } from "next/server";
import { getPublicSearchSuggestions } from "@server/data/publicLibrary";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { parseUiLocale } from "@/i18n/messages";

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicSearchRead");
  if (rateLimited) {
    return rateLimited;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "8", 10);
  const requestedLocale = searchParams.get("locale");
  const locale = parseUiLocale(requestedLocale);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 80) : 8;

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const results = await getPublicSearchSuggestions(query, limit, locale);

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
