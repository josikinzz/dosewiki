import { NextResponse } from "next/server";
import { getPublicSearchManifest } from "@server/data/publicLibrary";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { parseUiLocale } from "@/i18n/messages";

const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) {
    return rateLimited;
  }

  const requestedLocale = new URL(request.url).searchParams.get("locale");
  const locale = parseUiLocale(requestedLocale);
  const manifest = await getPublicSearchManifest(locale);
  const etag = `W/"${locale}-${manifest.shape}-${manifest.version}"`;

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
