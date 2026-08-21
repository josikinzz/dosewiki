/**
 * Public image endpoint for hand-authored chemical-class Markush depiction overrides.
 *
 * Class overrides share the `moleculeOverrides` table with substances under the
 * namespaced slug `class:<key>`. Convex is the only source for class drawings —
 * a class with no stored row simply has no structure image (404 here, and the
 * class detail page omits the figure).
 *
 * As with the substance route, the shared Convex row stores the dose.wiki brand palette, so
 * the Effect Index colourway is applied at serve time rather than in the data.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import {
  applyMoleculeColorway,
  resolveMoleculeColorway,
} from "@/data/mappings/moleculePalette";
import { getServerConvexReadClient } from "@server/convex/serverClient";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const CLASS_KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const rateLimited = await enforceRateLimit(request, "publicProxyRead");
  if (rateLimited) {
    return rateLimited;
  }

  const { key } = await params;
  if (!CLASS_KEY_RE.test(key)) {
    return NextResponse.json({ error: "Invalid class structure key." }, { status: 400 });
  }

  let override: { svg: string } | null = null;
  try {
    override = await getServerConvexReadClient().query(api.moleculeOverrides.getBySlug, {
      slug: `class:${key}`,
    });
  } catch {
    return NextResponse.json({ error: "Class structure lookup failed." }, { status: 502 });
  }

  if (!override) {
    return NextResponse.json({ error: "No override for this class structure." }, { status: 404 });
  }

  // Every colorway is a distinct cache key. Only versioned Convex depictions
  // are immutable; direct unversioned requests stay short-lived.
  const searchParams = new URL(request.url).searchParams;
  const isVersioned = searchParams.has("v");
  const colorway = resolveMoleculeColorway(searchParams.get("colorway"));

  return new NextResponse(applyMoleculeColorway(override.svg, colorway), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": isVersioned
        ? "public, max-age=31536000, s-maxage=31536000, immutable"
        : "public, max-age=0, s-maxage=60, must-revalidate",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
