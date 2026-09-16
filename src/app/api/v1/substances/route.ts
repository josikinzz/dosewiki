import { NextResponse } from "next/server";
import { getPublicSubstances } from "@server/data/publicData";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  PUBLIC_API_VERSION,
  applyPublicApiCors,
  decodePublicApiCursor,
  encodePublicApiCursor,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
  parsePublicApiLimit,
  projectPublicApiSubstancePreview,
  publicApiError,
} from "@server/public-api/v1";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  const { searchParams } = new URL(request.url);
  const limit = parsePublicApiLimit(searchParams.get("limit"));
  if (limit === null) {
    return NextResponse.json(
      publicApiError("invalid_request", "limit must be an integer between 1 and 100."),
      { status: 400, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  const offset = decodePublicApiCursor(searchParams.get("cursor"));
  if (offset === null) {
    return NextResponse.json(
      publicApiError("invalid_cursor", "cursor is invalid."),
      { status: 400, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  try {
    const substances = await getPublicSubstances();
    if (offset > substances.length) {
      return NextResponse.json(
        publicApiError("invalid_cursor", "cursor is outside the available result set."),
        { status: 400, headers: getPublicApiResponseHeaders({ cache: false }) },
      );
    }

    const page = substances.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return NextResponse.json(
      {
        data: page.map(projectPublicApiSubstancePreview),
        pagination: {
          limit,
          next_cursor: nextOffset < substances.length ? encodePublicApiCursor(nextOffset) : null,
          has_more: nextOffset < substances.length,
        },
        meta: { api_version: PUBLIC_API_VERSION, total: substances.length },
      },
      { headers: getPublicApiResponseHeaders() },
    );
  } catch (error) {
    console.error("Failed to read DoseWiki public API substances:", error);
    return NextResponse.json(
      publicApiError("service_unavailable", "Substance data is temporarily unavailable."),
      { status: 503, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }
}
