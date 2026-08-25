/**
 * Square Open Graph card for substance pages: the canonical Convex molecule
 * depiction rasterized onto a black base with a subtle radial glow.
 *
 * Substance metadata points here with a `?v=<updatedAt>` cache-buster
 * (`moleculeSocialCardUrl`), so an editor save rolls the URL and re-freezes
 * the CDN copy naturally. Substances without a stored molecule never link
 * here — they keep the flavor-wide social card.
 *
 * The Convex deployment is shared by both publications, so the stored SVG is
 * always in the dose.wiki brand palette; the card base is black on both, which
 * means dose.wiki serves the stored bytes while Effect Index applies its dark
 * colourway at serve time.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import {
  applyMoleculeColorway,
  type MoleculeColorway,
} from "@/data/mappings/moleculePalette";
import { isEffectIndex } from "@/config/siteFlavor";
import { getServerConvexReadClient } from "@server/convex/serverClient";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { renderMoleculeSocialCardPng } from "@server/og/moleculeSocialCard";

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
    return NextResponse.json({ error: "No molecule for this substance." }, { status: 404 });
  }

  const colorway: MoleculeColorway = isEffectIndex() ? "pro-dark" : "brand";

  let png: Buffer;
  try {
    png = await renderMoleculeSocialCardPng(applyMoleculeColorway(override.svg, colorway));
  } catch (error) {
    console.error(`Failed to render molecule social card for ${slug}:`, error);
    return NextResponse.json({ error: "Molecule card rendering failed." }, { status: 500 });
  }

  // A versioned URL is safe to freeze because each Convex save changes `v`;
  // direct unversioned hits stay fresh.
  const isVersioned = new URL(request.url).searchParams.has("v");

  // Copy into a plain Uint8Array: Buffer's ArrayBufferLike backing is not a
  // valid BodyInit, and the copy is negligible next to the raster work.
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": isVersioned
        ? "public, max-age=31536000, s-maxage=31536000, immutable"
        : "public, max-age=0, s-maxage=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
