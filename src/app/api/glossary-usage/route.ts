import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getGlossaryUsage } from "@server/translation/glossaryUsage";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "publicContentApiRead");
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const term = params.get("term")?.trim() ?? "";
  const rawOffset = params.get("offset") ?? "0";
  if (term.length < 2 || term.length > 160 || /\p{Cc}/u.test(term) || !/^\d{1,6}$/.test(rawOffset)) {
    return NextResponse.json({ error: "A term of 2 to 160 characters and a nonnegative offset are required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getGlossaryUsage(term, Number(rawOffset)), {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[glossary-usage] Public source lookup failed", error);
    return NextResponse.json({ error: "Usage sources could not be loaded. Please try again." }, { status: 503 });
  }
}
