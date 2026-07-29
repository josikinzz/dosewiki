/**
 * Public image endpoint for hand-authored chemical-class Markush depiction overrides.
 *
 * Class overrides share the `moleculeOverrides` table with substances under the
 * namespaced slug `class:<key>`. Non-overridden class structures keep using this
 * build's static `classes/*.svg` colourway assets.
 *
 * As with the substance route, the shared Convex row stores the dose.wiki brand palette, so
 * the Effect Index colourway is applied at serve time rather than in the data.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { applyFlavorMoleculeColorway } from "@/data/mappings/moleculePalette";
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

  return new NextResponse(applyFlavorMoleculeColorway(override.svg), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
