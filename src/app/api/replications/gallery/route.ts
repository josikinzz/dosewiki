import { NextResponse } from "next/server";

import { getPublicGalleryReplications } from "@server/convex/publicData";
import { enforceRateLimit } from "@server/http/nextRateLimit";

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
 * This intentionally returns the same slim projection as the initial RSC
 * props, rather than the public v1 representation. The public endpoint keeps
 * its established pagination and response contract untouched.
 */
export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const replications = await getPublicGalleryReplications();
    return NextResponse.json(
      { data: replications },
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
