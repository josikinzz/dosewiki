/**
 * Public image endpoint for hand-authored chemical-class Markush depiction overrides.
 *
 * Class overrides share the `moleculeOverrides` table with substances under the
 * namespaced slug `class:<key>`. Postgres is the only source for class drawings —
 * a class with no stored row simply has no structure image (404 here, and the
 * class detail page omits the figure).
 *
 * As with the substance route, the shared Postgres row stores the dose.wiki brand palette, so
 * the Effect Index colourway is applied at serve time rather than in the data.
 */
import { NextResponse } from "next/server";
import {
  applyMoleculeColorway,
  resolveMoleculeColorway,
} from "@/data/mappings/moleculePalette";
import { getPublicMolecule, type PublicMolecule } from "@server/data/publicData.molecules";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const CLASS_KEY_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NO_STORE = { "Cache-Control": "no-store" };

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
    return NextResponse.json({ error: "Invalid class structure key." }, { status: 400, headers: NO_STORE });
  }

  const searchParams = new URL(request.url).searchParams;
  const version = searchParams.get("v");
  if (version !== null && (
    !VERSION_RE.test(version)
    || new Date(version).toJSON() !== version
    || searchParams.getAll("v").length !== 1
  )) {
    return NextResponse.json({ error: "Invalid molecule version." }, { status: 400, headers: NO_STORE });
  }

  let molecule: PublicMolecule | null;
  try {
    molecule = await getPublicMolecule(`class:${key}`);
  } catch {
    return NextResponse.json({ error: "Class structure lookup failed." }, { status: 502, headers: NO_STORE });
  }

  if (molecule === null) {
    return NextResponse.json({ error: "No override for this class structure." }, { status: 404, headers: NO_STORE });
  }

  // Old revisions are not retained. Never put today's bytes under yesterday's
  // immutable URL, including when the metadata and image caches refresh apart.
  if (version !== null && version !== molecule.updatedAt) {
    return NextResponse.json({ error: "Molecule version unavailable." }, { status: 404, headers: NO_STORE });
  }

  // The colorway query remains part of each representation's URL identity.
  const colorway = resolveMoleculeColorway(searchParams.get("colorway"));

  return new NextResponse(applyMoleculeColorway(molecule.svg, colorway), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": version !== null
        ? "public, max-age=31536000, s-maxage=31536000, immutable"
        : "public, max-age=0, s-maxage=60, must-revalidate",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
