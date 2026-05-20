import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  fetchProtestKitPublicEgress,
  getPublicEgressCorsHeaders,
  isAllowedPublicEgressOrigin,
  parseProtestKitLookupInput,
} from "@/lib/publicEgressProxyPolicy";
import {
  validateProtestKitResponse,
} from "@/lib/reagentTesting";

export const runtime = "nodejs";

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

  const { searchParams } = new URL(request.url);
  const substance = parseProtestKitLookupInput(searchParams.get("substance"));
  if (!substance.ok && !searchParams.has("substance")) {
    return NextResponse.json({ error: "Missing substance parameter" }, { status: 400, headers });
  }

  if (!substance.ok) {
    return NextResponse.json({ error: "Invalid substance parameter" }, { status: 400, headers });
  }

  const upstream = await fetchProtestKitPublicEgress(substance.candidate);
  if (upstream.ok === false) {
    if (upstream.cacheControl) {
      headers.set("Cache-Control", upstream.cacheControl);
    }
    return NextResponse.json({ error: upstream.message }, { status: upstream.status, headers });
  }

  const validation = validateProtestKitResponse(upstream.data);
  if (!validation.ok) {
    return NextResponse.json({ error: "Invalid upstream API response" }, { status: 502, headers });
  }

  headers.set("Cache-Control", upstream.cacheControl);
  return NextResponse.json(validation.data, { status: 200, headers });
}
