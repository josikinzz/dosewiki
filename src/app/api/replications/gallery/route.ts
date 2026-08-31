import { NextResponse } from "next/server";

import { getPublicGalleryReplicationPage } from "@server/convex/publicData";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";
export const revalidate = 3600;

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const DEFAULT_PAGE_SIZE = 64;

/**
 * Internal, cacheable continuation for the statically rendered gallery.
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
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") || undefined;
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_PAGE_SIZE) {
      return NextResponse.json(
        { error: "limit must be an integer from 1 to 64." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const page = await getPublicGalleryReplicationPage(cursor, limit);
    return NextResponse.json(
      {
        data: page.items,
        nextCursor: page.isDone ? null : page.cursor,
        hasMore: !page.isDone,
      },
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
