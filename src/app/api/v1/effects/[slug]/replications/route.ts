import { NextResponse } from "next/server";
import { getPublicReplicationsByEffect } from "@server/data/publicData";
import { sortByMediaRank } from "@/features/replications/mediaRank";
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
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    // Audio-first media rank leads; the stored read order survives within
    // each rank, matching the article gallery's default playlist.
    const replications = sortByMediaRank(
      await getPublicReplicationsByEffect(slug),
      (replication) => replication,
    );
    return NextResponse.json({
      data: replications.map(projectPublicApiReplication),
      meta: { api_version: PUBLIC_API_VERSION, total: replications.length, effect_slug: slug },
    }, { headers: getPublicApiResponseHeaders() });
  } catch (error) {
    console.error(`Failed to read DoseWiki public API replications for ${slug}:`, error);
    return NextResponse.json(publicApiError("service_unavailable", "Replication data is temporarily unavailable."), {
      status: 503,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }
}
