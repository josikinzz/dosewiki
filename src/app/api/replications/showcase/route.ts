import { NextResponse } from "next/server";

import {
  getEffectShowcaseWorks,
  getSubstanceShowcaseWorks,
} from "@/app/_components/public-routes/showcaseCollections";
import { enforceRateLimit } from "@server/http/nextRateLimit";

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
    if ((substanceSlug === null) === (effectSlug === null)) {
      return NextResponse.json(
        { error: "Provide exactly one of ?substance= or ?effect=." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const collection =
      substanceSlug !== null
        ? await getSubstanceShowcaseWorks(substanceSlug)
        : await getEffectShowcaseWorks(effectSlug as string);
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
