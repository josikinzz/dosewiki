import { NextResponse } from "next/server";

import {
  getEffectShowcaseWorks,
  getSubstanceShowcaseWorks,
} from "@server/replications/showcaseCollections";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { parseUiLocale } from "@/i18n/messages";
import { getArtistViewerGroups } from "@server/next/artistViewerCollection";
import { isEmbedSlug } from "@/features/replications/embed/embedModel";

export const runtime = "nodejs";
export const revalidate = 3600;

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const { searchParams } = new URL(request.url);
    const substanceSlug = searchParams.get("substance");
    const effectSlug = searchParams.get("effect");
    const artistKey = searchParams.get("artist");
    if (artistKey !== null) {
      if (!isEmbedSlug(artistKey) || substanceSlug !== null || effectSlug !== null) {
        return NextResponse.json({ error: "Provide one valid artist collection." }, { status: 400 });
      }
      const groups = await getArtistViewerGroups(artistKey, parseUiLocale(searchParams.get("locale")));
      return NextResponse.json({ groups }, { headers: { "Cache-Control": CACHE_CONTROL } });
    }
    if ((substanceSlug === null) === (effectSlug === null)) {
      return NextResponse.json(
        { error: "Provide exactly one of ?substance= or ?effect=." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const requestedLocale = searchParams.get("locale");
    const locale = parseUiLocale(requestedLocale);

    const collection =
      substanceSlug !== null
        ? await getSubstanceShowcaseWorks(substanceSlug, locale)
        : await getEffectShowcaseWorks(effectSlug as string, locale);
    return NextResponse.json(
      { works: collection?.works ?? [] },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("Failed to read the replication showcase collection:", error);
    return NextResponse.json(
      { error: "Replication showcase data is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
