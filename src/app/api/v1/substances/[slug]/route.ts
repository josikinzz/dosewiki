import { NextResponse } from "next/server";
import { getPublicSubstanceBySlug } from "@server/data/publicData";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getCachedReagentDataForArticle } from "@server/reagentData";
import {
  PUBLIC_API_VERSION,
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
  projectPublicApiSubstanceDetail,
  publicApiError,
} from "@server/public-api/v1";

export const runtime = "nodejs";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      publicApiError("invalid_request", "slug is invalid."),
      { status: 400, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  try {
    const article = await getPublicSubstanceBySlug(slug);
    if (!article) {
      return NextResponse.json(
        publicApiError("not_found", "Substance not found."),
        { status: 404, headers: getPublicApiResponseHeaders({ cache: false }) },
      );
    }

    const externalReagentData = await getCachedReagentDataForArticle(article, slug);

    return NextResponse.json(
      {
        data: projectPublicApiSubstanceDetail(article, { externalReagentData }),
        meta: { api_version: PUBLIC_API_VERSION },
      },
      { headers: getPublicApiResponseHeaders() },
    );
  } catch (error) {
    console.error(`Failed to read DoseWiki public API substance ${slug}:`, error);
    return NextResponse.json(
      publicApiError("service_unavailable", "Substance data is temporarily unavailable."),
      { status: 503, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }
}
