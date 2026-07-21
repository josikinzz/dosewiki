import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  PUBLIC_API_BASE_PATH,
  PUBLIC_API_DISCLAIMER,
  PUBLIC_API_VERSION,
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
} from "@server/public-api/v1";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  return NextResponse.json(
    {
      data: {
        name: "DoseWiki Public API",
        version: PUBLIC_API_VERSION,
        base_path: PUBLIC_API_BASE_PATH,
        documentation: "https://dose.wiki/api/v1/openapi.json",
        license: "https://dose.wiki/docs/license",
        disclaimer: PUBLIC_API_DISCLAIMER,
      },
      meta: { api_version: PUBLIC_API_VERSION },
    },
    { headers: getPublicApiResponseHeaders() },
  );
}
