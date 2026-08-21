import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { loadArtistReplicationWalk } from "@server/next/routeLoaders.replications";
import {
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
} from "@server/public-api/v1";

/**
 * The replication viewer's artist walk: the same set, in the same order, as
 * the gallery's artist grouping (rails, Artist Page) — reshaped into viewer
 * items. A reader who entered the viewer from an artist's works listing
 * (`?set=artist:<key>`) walks *that artist's* works, not the active work's
 * effect; the viewer fetches this after hydration (the permalink page is
 * server-rendered with the effect walk it can compute without knowing where
 * the reader came from) and swaps its set when the active slug is a member.
 *
 * The key space is `artistUrlKey` — slugified credit lines plus `unknown` for
 * the merged Unattributed bucket — exactly the keys the Gallery Focus View
 * answers to, so every artist listing tile can emit its own group's key. The
 * walk itself comes from `loadArtistReplicationWalk`, shared with the artist
 * playlist surfaces, so ordering and membership are decided once.
 *
 * The body is the viewer's set contract — `{ scope, scopeLabel, items }` —
 * rather than the public API's `data`/`meta` envelope, for the same reason as
 * the substance sibling route: the only consumer is our own viewer client,
 * and any non-OK answer degrades to the effect walk the page already has.
 */

export const runtime = "nodejs";
const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);
  const { key } = await params;
  // One answer for "there is no artist walk here": malformed key, unknown
  // key, and an artist whose every work is withheld all look identical to the
  // viewer, which simply keeps the set it was served with.
  if (!KEY_RE.test(key)) {
    return NextResponse.json(
      { error: "not-found" },
      { status: 404, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  try {
    const walk = await loadArtistReplicationWalk(key);
    if (!walk) {
      return NextResponse.json(
        { error: "not-found" },
        { status: 404, headers: getPublicApiResponseHeaders({ cache: false }) },
      );
    }

    return NextResponse.json(
      {
        scope: "artist" as const,
        scopeLabel: walk.scopeLabel,
        items: walk.items,
      },
      { headers: getPublicApiResponseHeaders() },
    );
  } catch (error) {
    console.error(`Failed to read the artist replication viewer set for ${key}:`, error);
    // Distinct from 404 on purpose: "unavailable" must not teach the viewer
    // (or a cache) that this artist has no walk.
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }
}
