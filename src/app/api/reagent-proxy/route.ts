import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set([
  "https://dose.wiki",
  "https://www.dose.wiki",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3217",
  "http://127.0.0.1:3217",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function getCorsHeaders(request: Request): Headers {
  const headers = new Headers({
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export async function OPTIONS(request: Request) {
  const headers = getCorsHeaders(request);
  return new NextResponse(null, { status: 200, headers });
}

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, { windowMs: 60_000, max: 30 });
  if (rateLimited) {
    return rateLimited;
  }

  const headers = getCorsHeaders(request);
  const origin = request.headers.get("origin");

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403, headers });
  }

  const { searchParams } = new URL(request.url);
  const substance = searchParams.get("substance");

  if (!substance) {
    return NextResponse.json({ error: "Missing substance parameter" }, { status: 400, headers });
  }

  const sanitized = substance.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (sanitized.length === 0 || sanitized.length > 100) {
    return NextResponse.json({ error: "Invalid substance parameter" }, { status: 400, headers });
  }

  try {
    const upstreamResponse = await fetch(`https://protestkit.eu/api/v1/${encodeURIComponent(sanitized)}`, {
      headers: {
        "User-Agent": "dose.wiki/1.0 (harm-reduction-resource)",
        Accept: "application/json",
      },
    });

    if (!upstreamResponse.ok) {
      if (upstreamResponse.status === 404) {
        return NextResponse.json({ error: "Substance not found" }, { status: 404, headers });
      }

      return NextResponse.json({ error: "Upstream API error" }, { status: upstreamResponse.status, headers });
    }

    const data = await upstreamResponse.json();
    headers.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return NextResponse.json(data, { status: 200, headers });
  } catch (error) {
    console.error("ProtestKit proxy error:", error);
    return NextResponse.json({ error: "Failed to fetch from ProtestKit" }, { status: 500, headers });
  }
}
