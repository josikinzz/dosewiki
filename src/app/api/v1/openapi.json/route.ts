import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { applyPublicApiCors, getPublicApiCorsHeaders, getPublicApiResponseHeaders } from "@server/public-api/v1";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

const slugParameter = { name: "slug", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } };
const jsonResponse = (schema: object, description: string) => ({ description, content: { "application/json": { schema } } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export async function GET(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);

  const articleSections = ["identification", "classification", "dosage", "duration", "subjective_effects", "pharmacology", "interactions", "tolerance", "harm_potential", "legality"];
  const articleProperties = Object.fromEntries(articleSections.map((name) => [name, { type: "object", description: `Canonical ${name.replace(/_/g, " ")} article section`, additionalProperties: true }]));

  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "DoseWiki Public API",
      version: "1.1.0",
      description: "Read-only access to live public articles, reagent results, molecule depictions, and effect-replication media. Harm-reduction education only; not medical advice.",
      license: { name: "DoseWiki license and reuse terms", url: "https://dosewiki-admin.vercel.app/docs/license" },
    },
    servers: [{ url: "https://dosewiki-admin.vercel.app/api/v1" }],
    paths: {
      "/meta": { get: { summary: "Get API metadata", responses: { "200": jsonResponse({ type: "object" }, "API metadata") } } },
      "/substances": {
        get: {
          summary: "List public substances",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque cursor from the previous page." },
          ],
          responses: { "200": jsonResponse(ref("SubstancePage"), "Substance previews"), "400": { $ref: "#/components/responses/BadRequest" }, "429": { $ref: "#/components/responses/RateLimited" }, "503": { $ref: "#/components/responses/Unavailable" } },
        },
      },
      "/substances/{slug}": {
        get: { summary: "Get a complete public substance article", parameters: [slugParameter], responses: { "200": jsonResponse({ type: "object", properties: { data: ref("SubstanceDetail"), meta: ref("Meta") }, required: ["data", "meta"] }, "Article plus normalized reagent and molecule resources"), "400": { $ref: "#/components/responses/BadRequest" }, "404": { $ref: "#/components/responses/NotFound" }, "429": { $ref: "#/components/responses/RateLimited" }, "503": { $ref: "#/components/responses/Unavailable" } } },
      },
      "/substances/{slug}/reagent-tests": {
        get: { summary: "Get normalized reagent-test results", parameters: [slugParameter], responses: { "200": jsonResponse({ type: "object", properties: { data: ref("ReagentTesting"), meta: ref("Meta") } }, "Authored or ProtestKit snapshot results"), "404": { $ref: "#/components/responses/NotFound" } } },
      },
      "/replications": {
        get: { summary: "List public image and video replications", parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "effect", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["image", "video"] } },
        ], responses: { "200": jsonResponse({ type: "object", properties: { data: { type: "array", items: ref("Replication") }, pagination: ref("Pagination"), meta: ref("Meta") } }, "Public-safe replication media") } },
      },
      "/replications/{slug}": { get: { summary: "Get one replication", parameters: [slugParameter], responses: { "200": jsonResponse({ type: "object", properties: { data: ref("Replication"), meta: ref("Meta") } }, "Replication"), "404": { $ref: "#/components/responses/NotFound" } } } },
      "/effects/{slug}/replications": { get: { summary: "List replications for an effect", parameters: [slugParameter], responses: { "200": jsonResponse({ type: "object", properties: { data: { type: "array", items: ref("Replication") }, meta: ref("Meta") } }, "Effect replications") } } },
      "/molecules/{slug}.svg": { get: { summary: "Get a molecule SVG", parameters: [slugParameter, { name: "scheme", in: "query", schema: { type: "string", enum: ["dosewiki", "effect-index", "effect-index-dark"], default: "dosewiki" } }], responses: { "200": { description: "Sandboxed SVG depiction", content: { "image/svg+xml": { schema: { type: "string" } } } }, "404": { $ref: "#/components/responses/NotFound" } } } },
      "/openapi.json": { get: { summary: "Get this OpenAPI document", responses: { "200": { description: "OpenAPI 3.1 document" } } } },
    },
    components: {
      schemas: {
        Meta: { type: "object", properties: { api_version: { type: "string", const: "v1" } }, required: ["api_version"], additionalProperties: true },
        Pagination: { type: "object", properties: { limit: { type: "integer" }, next_cursor: { type: ["string", "null"] }, has_more: { type: "boolean" } }, required: ["limit", "next_cursor", "has_more"] },
        SubstancePreview: { type: "object", properties: { slug: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, priority: { type: ["string", "null"] }, categories: { type: "array", items: { type: "string" } }, url: { type: "string", format: "uri" } }, required: ["slug", "title", "summary", "categories", "url"] },
        SubstancePage: { type: "object", properties: { data: { type: "array", items: ref("SubstancePreview") }, pagination: ref("Pagination"), meta: ref("Meta") }, required: ["data", "pagination", "meta"] },
        SubstanceDetail: { type: "object", properties: { slug: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, ...articleProperties, comparisons: { type: "array", items: { type: "object" } }, reagent_testing: { type: "object", additionalProperties: { type: "string" } }, reagent_testing_normalized: ref("ReagentTesting"), history_culture: { type: ["object", "null"] }, references: { type: "array", items: { type: "object", additionalProperties: true } }, source_citations: { type: ["array", "null"], items: { type: "object", additionalProperties: true } }, citations: { type: "array", items: { type: "object", additionalProperties: true } }, molecule: ref("MoleculeResource"), url: { type: "string", format: "uri" } }, required: ["slug", "title", "summary", ...articleSections, "references", "citations", "molecule", "url"], additionalProperties: true },
        ReagentTesting: { type: "object", properties: { source: { type: "string", enum: ["authored", "protestkit_snapshot", "none"] }, substance: { type: ["object", "null"] }, results: { type: "array", items: { type: "object", properties: { reagent: { type: "string" }, label: { type: "string" }, description: { type: "string" }, hint: { type: "string" }, isReacting: { type: "boolean" }, colors: { type: "array", items: { type: "object" } } }, required: ["reagent", "description"] } } }, required: ["source", "results"] },
        MoleculeResource: { type: "object", properties: { chemical_identifiers: { type: "object" }, schemes: { type: "object", properties: { dosewiki: ref("Link"), "effect-index": ref("Link"), "effect-index-dark": ref("Link") }, required: ["dosewiki", "effect-index", "effect-index-dark"] } }, required: ["chemical_identifiers", "schemes"] },
        Link: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        // `effect_slug` is no longer required: the column is optional, so a
        // stored asset with no owning effect projects an object without the
        // field, and a schema that demanded it would describe a response the
        // endpoint can no longer promise. Dropping a required field only relaxes
        // the contract, and every published row today still carries one.
        //
        // `type` stays `image | video` on purpose. The store can hold `audio`,
        // but nothing on this site presents audio yet, so the reads behind this
        // endpoint withhold those rows entirely (see `isPublishableReplication`)
        // and the enum stays true of everything the API can return.
        Replication: { type: "object", properties: { slug: { type: "string" }, title: { type: "string" }, artist: { type: "string" }, artist_url: { type: "string", format: "uri" }, type: { type: "string", enum: ["image", "video"] }, effect_slug: { type: "string" }, url: { type: "string", format: "uri" }, thumbnail_url: { type: "string", format: "uri" }, preview_url: { type: "string", format: "uri" }, motion_url: { type: "string", format: "uri" }, motion_poster_url: { type: "string", format: "uri" }, width: { type: "number" }, height: { type: "number" }, format: { type: "string" }, file_size: { type: "number" }, duration: { type: "number" }, has_audio: { type: "boolean" }, order_index: { type: "integer" }, rights: { type: "object", properties: { status: { type: "string" }, license_name: { type: "string" }, license_url: { type: "string" }, credit_line: { type: "string" }, source_url: { type: "string" }, rightsholder: { type: "string" } }, required: ["status"] } }, required: ["slug", "title", "artist", "type", "url", "format", "rights"] },
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] }, meta: ref("Meta") }, required: ["error", "meta"] },
      },
      responses: {
        BadRequest: jsonResponse(ref("Error"), "Invalid request"), NotFound: jsonResponse(ref("Error"), "Not found"), RateLimited: { description: "Rate limit exceeded" }, Unavailable: jsonResponse(ref("Error"), "Temporarily unavailable"),
      },
    },
  }, { headers: getPublicApiResponseHeaders() });
}
