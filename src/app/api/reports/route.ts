import { NextResponse } from "next/server";
import { getReportBrowsePage } from "@server/next/reportBrowse";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "substance";
  const locale = params.get("locale");
  if (!["substance", "title", "author"].includes(view) || (locale && !Object.values(LIVE_LOCALES).some((entry) => entry.code === locale))) {
    return NextResponse.json({ error: "Invalid report view" }, { status: 400 });
  }
  if ((params.get("q")?.length ?? 0) > 500 || (params.get("substance")?.length ?? 0) > 256 || (params.get("cursor")?.length ?? 0) > 4096) {
    return NextResponse.json({ error: "Invalid report query" }, { status: 400 });
  }
  try {
    const page = await getReportBrowsePage({
      view: view as "substance" | "title" | "author",
      sortId: params.get("sort") ?? undefined,
      query: params.get("q") ?? undefined,
      substance: params.get("substance"),
      cursor: params.get("cursor"),
    }, locale);
    return NextResponse.json(page);
  } catch (error) {
    const invalidCursor = error instanceof Error && /report cursor/i.test(error.message);
    return NextResponse.json({ error: invalidCursor ? "Report cursor expired or invalid" : "Reports temporarily unavailable" }, { status: invalidCursor ? 400 : 503 });
  }
}
