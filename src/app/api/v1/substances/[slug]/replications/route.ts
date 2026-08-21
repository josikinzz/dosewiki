import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { loadSubstanceReplicationWalk } from "@server/next/routeLoaders.replications";
import {
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
} from "@server/public-api/v1";

/**
 * The replication viewer's substance walk: the same ordered gallery the
 * article's Replication Showcase renders, reshaped into viewer items. A
 * reader who entered the viewer from a substance article's showcase walks
 * *that substance's* works, not the active work's whole effect — the viewer
 * fetches this after hydration (the permalink page is server-rendered with
 * the effect walk it can compute without knowing where the reader came from)
 * and swaps its set when the active slug is a member.
 *
 * The walk itself comes from `loadSubstanceReplicationWalk` — the exact
 * builder the substance playlist page server-renders — so the set a shared
 * playlist URL reproduces and the set this route swaps in can never disagree.
 *
 * The body is the viewer's set contract — `{ scope, scopeLabel, items }`,
 * items shaped exactly like the permalink page's server props — rather than
 * the public API's `data`/`meta` envelope: the only consumer is our own
 * viewer client, and mirroring its prop shape means the swap is a state
 * replacement with no re-projection. Rate limiting and cache headers do
 * follow the sibling v1 routes; the viewer treats any non-OK answer as
 * "keep the server-provided set", so a limited or failing read degrades to
 * exactly the page the reader already has.
 */

export const runtime = "nodejs";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);
  const { slug } = await params;
  // `{ error: "not-found" }` is one answer for "there is no substance walk
  // here": unknown substance, malformed slug, and a substance whose gallery
  // is empty all look identical to the viewer, which simply keeps the set it
  // was served with.
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "not-found" },
      { status: 404, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  try {
    const walk = await loadSubstanceReplicationWalk(slug);
    if (!walk) {
      return NextResponse.json(
        { error: "not-found" },
        { status: 404, headers: getPublicApiResponseHeaders({ cache: false }) },
      );
    }

    return NextResponse.json(
      {
        scope: "substance" as const,
        scopeLabel: walk.scopeLabel,
        items: walk.items,
      },
      { headers: getPublicApiResponseHeaders() },
    );
  } catch (error) {
    console.error(`Failed to read the substance replication viewer set for ${slug}:`, error);
    // Distinct from 404 on purpose: "unavailable" must not teach the viewer
    // (or a cache) that this substance has no walk.
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }
}
