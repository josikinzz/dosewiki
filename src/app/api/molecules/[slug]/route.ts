/**
 * Public image endpoint for canonical Postgres molecule depictions.
 *
 * The substance page points here when that slug has a `moleculeOverrides` row,
 * with a `?v=<updatedAt>` revision. Missing rows mean no depiction; lookup
 * failures remain transient errors rather than cached absence.
 *
 * The Postgres deployment is shared by both publications, so the stored SVG is always in the
 * dose.wiki brand palette and the Effect Index colourway is applied here, at serve time —
 * it cannot live in the data without breaking the other site.
 */
import { NextResponse } from "next/server";
import {
  applyMoleculeColorway,
  resolveMoleculeColorway,
} from "@/data/mappings/moleculePalette";
import { getPublicMolecule, type PublicMolecule } from "@server/data/publicData.molecules";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NO_STORE = { "Cache-Control": "no-store" };

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
    return NextResponse.json({ error: "Invalid molecule slug." }, { status: 400, headers: NO_STORE });
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
    molecule = await getPublicMolecule(slug);
  } catch {
    return NextResponse.json({ error: "Molecule lookup failed." }, { status: 502, headers: NO_STORE });
  }

  if (molecule === null) {
    return NextResponse.json({ error: "No override for this molecule." }, { status: 404, headers: NO_STORE });
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
      // Editor-authored SVG served same-origin: sandbox so scripts never run
      // when the URL is opened directly (harmless as an <img> source).
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
