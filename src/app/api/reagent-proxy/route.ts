import { NextResponse } from "next/server";
import { getPublicReagentTestBySlug } from "@server/data/publicData.reagents";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  getPublicEgressCorsHeaders,
  isAllowedPublicEgressOrigin,
} from "@/lib/publicEgressProxyPolicy";

export const runtime = "nodejs";

const REAGENT_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseSlug(request: Request): string | null {
  const value = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  return value.length <= 100 && SLUG_PATTERN.test(value) ? value : null;
}

export async function OPTIONS(request: Request) {
  const headers = getPublicEgressCorsHeaders(request);
  return new NextResponse(null, { status: 200, headers });
}

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicProxyRead");
  if (rateLimited) {
    return rateLimited;
  }

  const headers = getPublicEgressCorsHeaders(request);
  const origin = request.headers.get("origin");

  if (origin && !isAllowedPublicEgressOrigin(origin)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403, headers });
  }

  const slug = parseSlug(request);
  if (!slug) {
    return NextResponse.json({ error: "Missing or invalid slug parameter" }, { status: 400, headers });
  }

  try {
    const data = await getPublicReagentTestBySlug(slug);
    headers.set("Cache-Control", REAGENT_CACHE_CONTROL);
    return data
      ? NextResponse.json(data, { status: 200, headers })
      : new NextResponse(null, { status: 204, headers });
  } catch {
    return NextResponse.json(
      { error: "Reagent data is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
