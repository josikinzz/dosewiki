import { NextResponse } from "next/server";
import { getPublicHistoryDiff } from "@server/data/publicData.changelog";
import { enforceRateLimit } from "@server/http/nextRateLimit";

const DIFF_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const REFUSAL_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return rateLimited;

  const { entryId } = await params;
  const article = new URL(request.url).searchParams.get("article")?.trim() || null;
  if (!entryId || entryId.length > 512 || (article && article.length > 256)) {
    return NextResponse.json({ error: "Invalid history target" }, { status: 400, headers: REFUSAL_HEADERS });
  }
  try {
    const markdown = await getPublicHistoryDiff(entryId, article, new URL(request.url).searchParams.get("view") === "entry");
    if (markdown === null) {
      return NextResponse.json({ error: "History entry not found" }, { status: 404, headers: REFUSAL_HEADERS });
    }
    return NextResponse.json({ markdown }, { headers: { "Cache-Control": DIFF_CACHE_CONTROL } });
  } catch {
    return NextResponse.json({ error: "History temporarily unavailable" }, { status: 503, headers: REFUSAL_HEADERS });
  }
}
