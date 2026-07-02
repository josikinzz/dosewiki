/**
 * Public image endpoint for hand-authored molecule depiction overrides.
 *
 * The substance page only points a molecule <img> here when that slug has an
 * override in the `moleculeOverrides` Convex table (see `loadSubstanceRoute`),
 * with a `?v=<updatedAt>` cache-buster. Non-overridden molecules keep using the
 * static `/molecules/*.svg` assets, so this stays off the hot path.
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
      "Cache-Control": "public, max-age=300, s-maxage=31536000, stale-while-revalidate=86400",
      // Editor-authored SVG served same-origin: sandbox so scripts never run
      // when the URL is opened directly (harmless as an <img> source).
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
