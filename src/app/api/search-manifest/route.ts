import { NextResponse } from "next/server";
import { getPublicSearchManifest } from "@server/convex/publicLibrary";
import { enforceRateLimit } from "@server/http/nextRateLimit";

/**
 * Names and aliases for every searchable entry, fetched once per browser and
 * matched locally from then on.
 *
 * The URL is stable, so freshness rides on the ETag: the manifest's version is
 * the index input hash, which changes exactly when the content behind it does.
 * A returning client re-validates in a 304 instead of re-downloading.
 */
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) {
    return rateLimited;
  }

  const manifest = await getPublicSearchManifest();
  const etag = `W/"${manifest.shape}-${manifest.version}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
    });
  }

  return NextResponse.json(manifest, {
    headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
  });
}
