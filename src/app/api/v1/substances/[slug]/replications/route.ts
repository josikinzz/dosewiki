import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  decodeSubstanceReplicationCursor,
  encodeSubstanceReplicationCursor,
  getPublicApiSubstanceReplications,
} from "@server/public-api/substanceReplications";
import {
  PUBLIC_API_VERSION,
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
  parsePublicApiLimit,
  publicApiError,
} from "@server/public-api/v1";

export const runtime = "nodejs";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parsePublicApiLimit(searchParams.get("limit"));
  if (!SLUG_RE.test(slug) || limit === null) {
    return NextResponse.json(publicApiError("invalid_request", "slug or limit is invalid."), {
      status: 400,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }
  const cursorValue = searchParams.get("cursor");
  const cursor = cursorValue ? decodeSubstanceReplicationCursor(cursorValue) : null;
  if (cursorValue && (!cursor || cursor.substance_slug !== slug)) {
    return NextResponse.json(publicApiError("invalid_cursor", "cursor is invalid for this collection."), {
      status: 400,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }

  try {
    const collection = await getPublicApiSubstanceReplications(slug);
    if (!collection) {
      return NextResponse.json(publicApiError("not_found", "Substance not found."), {
        status: 404,
        headers: getPublicApiResponseHeaders({ cache: false }),
      });
    }
    const offset = cursor?.offset ?? 0;
    if (cursor && (cursor.revision !== collection.revision || offset > collection.data.length)) {
      return NextResponse.json(publicApiError("invalid_cursor", "Collection changed or cursor is outside the available result set. Restart without a cursor."), {
        status: 400,
        headers: getPublicApiResponseHeaders({ cache: false }),
      });
    }
    const data = collection.data.slice(offset, offset + limit);
    const nextOffset = offset + data.length;
    const hasMore = nextOffset < collection.data.length;
    return NextResponse.json({
      data,
      pagination: {
        limit,
        next_cursor: hasMore ? encodeSubstanceReplicationCursor({
          substance_slug: slug,
          revision: collection.revision,
          offset: nextOffset,
        }) : null,
        has_more: hasMore,
      },
      meta: {
        api_version: PUBLIC_API_VERSION,
        total: collection.data.length,
        substance_slug: slug,
        collection_label: collection.collectionLabel,
        collection_revision: collection.revision,
      },
    }, { headers: getPublicApiResponseHeaders() });
  } catch (error) {
    console.error(`Failed to read DoseWiki public API substance replications for ${slug}:`, error);
    return NextResponse.json(publicApiError("service_unavailable", "Replication data is temporarily unavailable."), {
      status: 503,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }
}
