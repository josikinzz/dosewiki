import { NextResponse } from "next/server";
import {
  applyMoleculeColorway,
  type MoleculeColorway,
} from "@/data/mappings/moleculePalette";
import { getPublicMolecule } from "@server/data/publicData.molecules";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
  publicApiError,
} from "@server/public-api/v1";

export const runtime = "nodejs";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCHEME_COLORWAYS = {
  dosewiki: "brand",
  "effect-index": "pro-light",
  "effect-index-dark": "pro-dark",
} as const satisfies Record<string, MoleculeColorway>;

function isMoleculeScheme(value: string): value is keyof typeof SCHEME_COLORWAYS {
  return Object.prototype.hasOwnProperty.call(SCHEME_COLORWAYS, value);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  const rawSlug = (await params).slug;
  const slug = rawSlug.endsWith(".svg") ? rawSlug.slice(0, -4) : rawSlug;
  const scheme = new URL(request.url).searchParams.get("scheme") ?? "dosewiki";
  if (slug.length > 128 || !SLUG_RE.test(slug) || !isMoleculeScheme(scheme)) {
    return NextResponse.json(publicApiError("invalid_request", "slug or scheme is invalid."), {
      status: 400,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }
  const colorway = SCHEME_COLORWAYS[scheme];

  let svg: string | null = null;
  try {
    svg = (await getPublicMolecule(slug))?.svg ?? null;
  } catch (error) {
    console.error(`Failed to read DoseWiki public API molecule ${slug}:`, error);
    return NextResponse.json(publicApiError("service_unavailable", "Molecule data is temporarily unavailable."), {
      status: 503,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }

  if (!svg) {
    return NextResponse.json(publicApiError("not_found", "Molecule depiction not found."), {
      status: 404,
      headers: getPublicApiResponseHeaders({ cache: false }),
    });
  }
  svg = applyMoleculeColorway(svg, colorway);

  const headers = getPublicApiResponseHeaders();
  headers.set("Content-Type", "image/svg+xml; charset=utf-8");
  headers.set("Content-Security-Policy", "sandbox");
  return new NextResponse(svg, { headers });
}
