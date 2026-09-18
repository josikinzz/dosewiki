import { NextResponse } from "next/server";

import {
  getEffectShowcaseWorks,
  getSubstanceShowcaseWorks,
} from "@/app/_components/public-routes/showcaseCollections";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { parseUiLocale } from "@/i18n/messages";
import { getArtistViewerGroups } from "@server/next/artistViewerCollection";
import { isEmbedSlug } from "@/features/replications/embed/embedModel";

export const runtime = "nodejs";
export const revalidate = 3600;

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

/**
 * Internal, cacheable long tail for the article Replication Showcases.
 *
 * Articles serialize only the compact strip (`SHOWCASE_WORK_CAP` works); the
 * expanded viewer fetches the complete ordered collection here on first
 * intent. The response is the same `ShowcaseWork` projection as the initial
 * RSC props, produced by the same shared helpers, so the strip is always a
 * prefix of what this returns. An unknown slug is an empty collection, not an
 * error: the client degrades identically either way and the answer stays
 * cacheable.
 *
 * `?locale=<code>` names a live locale mirror: the same collection with the
 * effect names the mirror's strip already shows. The URL is the cache key, so
 * each locale holds its own CDN entry.
 */
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
