/**
 * Public image endpoint for canonical Convex molecule depictions.
 *
 * The substance page points here when that slug has a `moleculeOverrides` row,
 * with a `?v=<updatedAt>` cache-buster. Missing rows and index-query failures
 * retain the static `/molecules/*.svg` fallback in `loadSubstanceRoute`.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getServerConvexReadClient } from "@server/convex/serverClient";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rateLimited = await enforceRateLimit(request, "publicProxyRead");
  if (rateLimited) {
    return rateLimited;
  }

  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid molecule slug." }, { status: 400 });
  }

  let override: { svg: string } | null = null;
  try {
    override = await getServerConvexReadClient().query(api.moleculeOverrides.getBySlug, { slug });
  } catch {
    return NextResponse.json({ error: "Molecule lookup failed." }, { status: 502 });
  }

  if (!override) {
    return NextResponse.json({ error: "No override for this molecule." }, { status: 404 });
  }

  return new NextResponse(override.svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // The page busts this with ?v=<updatedAt> on every save, so a hit is immutable.
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      // Editor-authored SVG served same-origin: sandbox so scripts never run
      // when the URL is opened directly (harmless as an <img> source).
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
