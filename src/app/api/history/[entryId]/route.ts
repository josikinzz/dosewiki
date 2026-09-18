import { NextResponse } from "next/server";
import { getPublicHistoryDiff } from "@server/data/publicData.changelog";

export async function GET(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const article = new URL(request.url).searchParams.get("article")?.trim() || null;
  if (!entryId || entryId.length > 512 || (article && article.length > 256)) {
    return NextResponse.json({ error: "Invalid history target" }, { status: 400 });
  }
  try {
    const markdown = await getPublicHistoryDiff(entryId, article, new URL(request.url).searchParams.get("view") === "entry");
    if (markdown === null) return NextResponse.json({ error: "History entry not found" }, { status: 404 });
    return NextResponse.json({ markdown });
  } catch {
    return NextResponse.json({ error: "History temporarily unavailable" }, { status: 503 });
  }
}
