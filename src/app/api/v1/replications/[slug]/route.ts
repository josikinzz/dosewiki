import { NextResponse } from "next/server";
import { getPublicReplicationBySlug } from "@server/data/publicData";
import { isPublishableReplication } from "@/types/replications";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  PUBLIC_API_VERSION,
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
  projectPublicApiReplication,
  publicApiError,
} from "@server/public-api/v1";

export const runtime = "nodejs";
// Underscores are legal here even though they are not the house slug style: a
// chunk of the replication corpus was imported straight from filenames, and
// rejecting those slugs 400s rows that genuinely exist.
const SLUG_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(publicApiError("invalid_request", "slug is invalid."), {
      status: 400,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }

  try {
    const replication = await getPublicReplicationBySlug(slug);
    if (!replication || !isPublishableReplication(replication) || !replication.url) {
      return NextResponse.json(publicApiError("not_found", "Replication not found."), {
        status: 404,
        headers: getPublicApiResponseHeaders({ cache: false }),
      });
    }
    return NextResponse.json({
      data: projectPublicApiReplication(replication),
      meta: { api_version: PUBLIC_API_VERSION },
    }, { headers: getPublicApiResponseHeaders() });
  } catch (error) {
    console.error(`Failed to read DoseWiki public API replication ${slug}:`, error);
    return NextResponse.json(publicApiError("service_unavailable", "Replication data is temporarily unavailable."), {
      status: 503,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }
}
