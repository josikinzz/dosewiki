import { NextResponse } from "next/server";

import {
  getPublicContributorDirectory,
  getPublicGalleryReplications,
} from "@server/convex/publicData";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import { getLocalizedPublicGalleryReplications } from "@server/translation/localizedRecords";

export const runtime = "nodejs";

// The browser keeps the corpus for the same hour the CDN and the ISR page do:
// the ~6.6k-item response is ~1.4 MB compressed, and nothing the page shows
// can be fresher than its own hourly window anyway. Re-downloading it on every
// visit within that hour bought no freshness.
const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

/**
 * The complete gallery corpus in one cacheable response.
 *
 * The statically rendered index inlines only the top artist rails; after
 * hydration the explorer fetches this endpoint once (on idle, or eagerly for
 * deep links and filtered states) instead of walking ~110 bounded pages. The
 * corpus is assembled server-side from bounded, tag-cached Convex pages
 * (`getPublicGalleryReplications`), so the origin cost is one in-memory join;
 * the CDN holds the response for the same hourly window as the page itself.
 *
 * The complete contributor directory rides along: it is one entry per credited
 * artist in the corpus, so it is only usable once the corpus itself is here,
 * and shipping it in the index page's RSC payload cost ~430 kB on every visit
 * (and on every homepage prefetch) to serve the couple of dozen artists the
 * prerendered rails show. The page now inlines only those, and the explorer
 * adopts this copy when the corpus lands.
 *
 * This intentionally returns the same slim projection as the initial RSC
 * props, rather than the public v1 representation. The public endpoint keeps
 * its established pagination and response contract untouched.
 *
 * `?locale=<code>` names a live locale mirror: the same corpus with each
 * work's stored title spliced in, so the explorer on the mirror keeps reading
 * in its language once the complete corpus replaces the prerendered rails.
 * The URL is the cache key, so each locale holds its own CDN entry.
 */
export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) {
    return rateLimited;
  }

  const locale = new URL(request.url).searchParams.get("locale");
  const mirror = LIVE_LOCALE_CODES.find((code) => code === locale) ?? null;

  try {
    const [replications, contributorDirectory] = await Promise.all([
      mirror ? getLocalizedPublicGalleryReplications(mirror) : getPublicGalleryReplications(),
      getPublicContributorDirectory(),
    ]);
    return NextResponse.json(
      { data: replications, contributorDirectory },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("Failed to read replication gallery previews:", error);
    return NextResponse.json(
      { error: "Replication gallery data is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
