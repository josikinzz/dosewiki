import { NextResponse } from "next/server";
import { getPublicReplications } from "@server/convex/publicData";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  PUBLIC_API_VERSION,
  applyPublicApiCors,
  decodePublicApiCursor,
  encodePublicApiCursor,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
  parsePublicApiLimit,
  projectPublicApiReplication,
  publicApiError,
} from "@server/public-api/v1";

export const runtime = "nodejs";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  const { searchParams } = new URL(request.url);
  const limit = parsePublicApiLimit(searchParams.get("limit"));
  const offset = decodePublicApiCursor(searchParams.get("cursor"));
  const effect = searchParams.get("effect");
  const type = searchParams.get("type");

  if (limit === null || offset === null || (effect && !SLUG_RE.test(effect)) || (type && type !== "image" && type !== "video")) {
    return NextResponse.json(
      publicApiError("invalid_request", "limit, cursor, effect, or type is invalid."),
      { status: 400, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  try {
    const all = (await getPublicReplications())
      .filter((item) => !effect || item.effect_slug === effect)
      .filter((item) => !type || item.type === type)
      .sort((a, b) => a.effect_slug.localeCompare(b.effect_slug) || (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER) || a.slug.localeCompare(b.slug));

    if (offset > all.length) {
      return NextResponse.json(publicApiError("invalid_cursor", "cursor is outside the available result set."), {
        status: 400,
        headers: getPublicApiResponseHeaders({ cache: false }),
      });
    }

    const page = all.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return NextResponse.json({
      data: page.map(projectPublicApiReplication),
      pagination: {
        limit,
        next_cursor: nextOffset < all.length ? encodePublicApiCursor(nextOffset) : null,
        has_more: nextOffset < all.length,
      },
      meta: { api_version: PUBLIC_API_VERSION, total: all.length },
    }, { headers: getPublicApiResponseHeaders() });
  } catch (error) {
    console.error("Failed to read DoseWiki public API replications:", error);
    return NextResponse.json(publicApiError("service_unavailable", "Replication data is temporarily unavailable."), {
      status: 503,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }
}
