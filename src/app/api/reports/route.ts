import { NextResponse } from "next/server";
import { getReportBrowsePage } from "@server/next/reportBrowse";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { enforceRateLimit } from "@server/http/nextRateLimit";

const PAGE_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const REFUSAL_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return rateLimited;

  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "substance";
  const locale = params.get("locale");
  if (!["substance", "title", "author"].includes(view) || (locale && !Object.values(LIVE_LOCALES).some((entry) => entry.code === locale))) {
    return NextResponse.json({ error: "Invalid report view" }, { status: 400, headers: REFUSAL_HEADERS });
  }
  if ((params.get("q")?.length ?? 0) > 500 || (params.get("substance")?.length ?? 0) > 256 || (params.get("cursor")?.length ?? 0) > 4096) {
    return NextResponse.json({ error: "Invalid report query" }, { status: 400, headers: REFUSAL_HEADERS });
  }
  try {
    const page = await getReportBrowsePage({
      view: view as "substance" | "title" | "author",
      sortId: params.get("sort") ?? undefined,
      query: params.get("q") ?? undefined,
      substance: params.get("substance"),
      cursor: params.get("cursor"),
    }, locale);
    return NextResponse.json(page, { headers: { "Cache-Control": PAGE_CACHE_CONTROL } });
  } catch (error) {
    const invalidCursor = error instanceof Error && /report cursor/i.test(error.message);
    return NextResponse.json(
      { error: invalidCursor ? "Report cursor expired or invalid" : "Reports temporarily unavailable" },
      { status: invalidCursor ? 400 : 503, headers: REFUSAL_HEADERS },
    );
  }
}
