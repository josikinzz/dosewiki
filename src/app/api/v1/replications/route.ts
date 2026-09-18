import { NextResponse } from "next/server";
import {
  getPublicReplications,
  getPublicReplicationsBySlugs,
} from "@server/data/publicData";
import { replicationMediaRank } from "@/features/replications/mediaRank";
import { curatedEffectPosition } from "@/types/replications";
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

  // `type` mirrors the published kind enum in the OpenAPI document, audio
  // included; a value outside it is a client error rather than an empty page.
  if (
    limit === null ||
    offset === null ||
    (effect && !SLUG_RE.test(effect)) ||
    (type && type !== "image" && type !== "video" && type !== "audio")
  ) {
    return NextResponse.json(
      publicApiError("invalid_request", "limit, cursor, effect, or type is invalid."),
      { status: 400, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  try {
    const all = (await getPublicReplications())
      .filter((item) => !effect || item.effect_slug === effect)
      .filter((item) => !type || item.type === type)
      // Audio-first media rank leads, then the catalog order beneath it.
      // `effect_slug` is optional: a stored asset can have no owning effect at
      // all. Calling `.localeCompare` on it threw inside this `try`, so a single
      // effect-less row turned the whole endpoint into a 503 — every consumer
      // loses every replication because of one row. Unattached rows sort ahead
      // of the rest; the 247 existing rows all carry an effect and are unmoved.
      .sort((a, b) => replicationMediaRank(a) - replicationMediaRank(b) || (a.effect_slug ?? "").localeCompare(b.effect_slug ?? "") || (curatedEffectPosition(a) ?? Number.MAX_SAFE_INTEGER) - (curatedEffectPosition(b) ?? Number.MAX_SAFE_INTEGER) || a.slug.localeCompare(b.slug));

    if (offset > all.length) {
      return NextResponse.json(publicApiError("invalid_cursor", "cursor is outside the available result set."), {
        status: 400,
        headers: getPublicApiResponseHeaders({ cache: false }),
      });
    }

    const pageIndex = all.slice(offset, offset + limit);
    const details = await getPublicReplicationsBySlugs(
      pageIndex.map(({ slug }) => slug),
    );
    const detailsBySlug = new Map(details.map((item) => [item.slug, item]));
    const page = pageIndex.flatMap((item) => {
      const detail = detailsBySlug.get(item.slug);
      return detail ? [detail] : [];
    });
    const nextOffset = offset + pageIndex.length;
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
