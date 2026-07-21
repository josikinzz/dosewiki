import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { applyPublicApiCors, getPublicApiCorsHeaders, getPublicApiResponseHeaders } from "@server/public-api/v1";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "DoseWiki Public API",
        version: "1.0.0",
        description: "Read-only access to DoseWiki's live public substance data. Content is for harm-reduction education and is not medical advice.",
        license: { name: "DoseWiki license and reuse terms", url: "https://dose.wiki/docs/license" },
      },
      servers: [{ url: "https://dose.wiki/api/v1" }],
      paths: {
        "/meta": {
          get: { summary: "Get API metadata", responses: { "200": { description: "API metadata" } } },
        },
        "/substances": {
          get: {
            summary: "List public substances",
            parameters: [
              { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
              { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque cursor returned by the previous page." },
            ],
            responses: {
              "200": { description: "A page of substance previews" },
              "400": { description: "Invalid limit or cursor" },
              "429": { description: "Rate limit exceeded" },
              "503": { description: "Data temporarily unavailable" },
            },
          },
        },
        "/substances/{slug}": {
          get: {
            summary: "Get one complete public substance article",
            parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } }],
            responses: {
              "200": { description: "Public substance article" },
              "400": { description: "Invalid slug" },
              "404": { description: "Substance not found" },
              "429": { description: "Rate limit exceeded" },
              "503": { description: "Data temporarily unavailable" },
            },
          },
        },
      },
    },
    { headers: getPublicApiResponseHeaders() },
  );
}
