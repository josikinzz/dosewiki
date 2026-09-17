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
      version: "1.2.0",
      description: "Read-only access to live public articles, reagent results, molecule depictions, and effect and substance replication media. Harm-reduction education only; not medical advice.",
      license: { name: "DoseWiki license and reuse terms", url: "https://dose.wiki/docs/license" },
    },
    servers: [{ url: "https://dose.wiki/api/v1" }],
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
      "/substances/{slug}/replications": {
        get: {
          summary: "List the canonical substance article replication collection",
          description: "The complete article showcase in canonical order, with public placement evidence and existing media rights. A known substance without media returns an empty 200; an unknown substance returns 404. No substance matching or curation is performed by this API.",
          parameters: [
            slugParameter,
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque cursor bound to this substance and ordered collection revision. Return unchanged. Malformed, foreign, stale, or out-of-range cursors return 400 invalid_cursor; discard accumulated pages and restart without a cursor after a revision change." },
          ],
          responses: {
            "200": jsonResponse(ref("SubstanceReplicationPage"), "Canonical ordered collection, including an empty collection for a known substance"),
            "400": { $ref: "#/components/responses/BadRequest" },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
            "503": { $ref: "#/components/responses/Unavailable" },
          },
        },
      },
      "/replications": {
        get: { summary: "List public image, video, and audio replications", description: "Filters apply before pagination. Order is media rank first, then effect slug (unattached works first), curated within-effect position when available, and replication slug.", parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "effect", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["image", "video", "audio"] } },
        ], responses: { "200": jsonResponse({ type: "object", properties: { data: { type: "array", items: ref("Replication") }, pagination: ref("Pagination"), meta: ref("Meta") } }, "Public-safe replication media") } },
      },
      "/replications/{slug}": { get: { summary: "Get one replication", parameters: [slugParameter], responses: { "200": jsonResponse({ type: "object", properties: { data: ref("Replication"), meta: ref("Meta") } }, "Replication"), "404": { $ref: "#/components/responses/NotFound" } } } },
      "/effects/{slug}/replications": { get: { summary: "List replications depicting an effect", description: "All publishable works with this exact owning effect_slug OR an explicit effect_tags assignment, deduplicated. No ancestor or descendant inference. The owning effect and complete public rights/source metadata are preserved; artist-gallery display exclusions do not apply.", parameters: [slugParameter], responses: { "200": jsonResponse({ type: "object", properties: { data: { type: "array", items: ref("Replication") }, meta: ref("Meta") } }, "Effect replications") } } },
      "/molecules/{slug}.svg": { get: { summary: "Get a molecule SVG", parameters: [slugParameter, { name: "scheme", in: "query", schema: { type: "string", enum: ["dosewiki", "effect-index", "effect-index-dark"], default: "dosewiki" } }], responses: { "200": { description: "Sandboxed SVG depiction", content: { "image/svg+xml": { schema: { type: "string" } } } }, "404": { $ref: "#/components/responses/NotFound" } } } },
      "/openapi.json": { get: { summary: "Get this OpenAPI document", responses: { "200": { description: "OpenAPI 3.1 document" } } } },
    },
    components: {
      schemas: {
        Meta: { type: "object", properties: { api_version: { type: "string", const: "v1" } }, required: ["api_version"], additionalProperties: true },
        Pagination: { type: "object", properties: { limit: { type: "integer" }, next_cursor: { type: ["string", "null"] }, has_more: { type: "boolean" } }, required: ["limit", "next_cursor", "has_more"] },
        SubstanceReplicationAssociation: {
          type: "object",
          description: "Publisher-known placement evidence, not a claim that the media documents this drug's effects. Private curation lists, exclusions, and notes are never exposed.",
          properties: {
            substance_slug: { type: "string", description: "The substance whose collection is being read." },
            basis: { type: "string", enum: ["specific_drug", "drug_class", "visual_disconnection", "curated", "unknown"], description: "specific_drug: standalone title-drug association; drug_class: an allowed general dissociative/deliriant class rule; visual_disconnection: the canonical dissociative still-image fallback; curated: editorial placement without a more specific known basis; unknown: no recognized publisher provenance. Curated ordering alone does not change a work's basis." },
            effect_slug: { type: "string", description: "Owning effect recorded in the placement evidence, when known." },
            drug_class: { type: "string", enum: ["dissociatives", "deliriants"], description: "The permitted class recorded in the placement evidence, when known." },
          },
          required: ["substance_slug", "basis"],
          additionalProperties: false,
        },
        SubstanceReplication: {
          allOf: [ref("Replication"), { type: "object", properties: { association: ref("SubstanceReplicationAssociation") }, required: ["association"] }],
        },
        SubstanceReplicationPage: {
          type: "object",
          properties: {
            data: { type: "array", items: ref("SubstanceReplication"), description: "Canonical article showcase order. Key works by slug, not storage URL or order_index; preserve artist credit and rights." },
            pagination: ref("Pagination"),
            meta: {
              allOf: [ref("Meta"), {
                type: "object",
                properties: {
                  total: { type: "integer", minimum: 0 },
                  substance_slug: { type: "string" },
                  collection_label: { type: "string" },
                  collection_revision: { type: "string", pattern: "^[a-f0-9]{64}$", description: "Revision of ordered work identities and public association context, not a media-byte version or an ETag. Rotating storage URLs do not invalidate traversal." },
                },
                required: ["total", "substance_slug", "collection_label", "collection_revision"],
              }],
            },
          },
          required: ["data", "pagination", "meta"],
        },
        SubstancePreview: { type: "object", properties: { slug: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, priority: { type: ["string", "null"] }, categories: { type: "array", items: { type: "string" } }, url: { type: "string", format: "uri" } }, required: ["slug", "title", "summary", "categories", "url"] },
        SubstancePage: { type: "object", properties: { data: { type: "array", items: ref("SubstancePreview") }, pagination: ref("Pagination"), meta: ref("Meta") }, required: ["data", "pagination", "meta"] },
        SubstanceDetail: { type: "object", properties: { slug: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, ...articleProperties, comparisons: { type: "array", items: { type: "object" } }, reagent_testing: { type: "object", additionalProperties: { type: "string" } }, reagent_testing_normalized: ref("ReagentTesting"), history_culture: { type: ["object", "null"] }, references: { type: "array", items: { type: "object", additionalProperties: true } }, source_citations: { type: ["array", "null"], items: { type: "object", additionalProperties: true } }, citations: { type: "array", items: { type: "object", additionalProperties: true } }, molecule: ref("MoleculeResource"), url: { type: "string", format: "uri" } }, required: ["slug", "title", "summary", ...articleSections, "references", "citations", "molecule", "url"], additionalProperties: true },
        ReagentTesting: { type: "object", properties: { source: { type: "string", enum: ["authored", "protestkit_snapshot", "none"] }, substance: { type: ["object", "null"] }, results: { type: "array", items: { type: "object", properties: { reagent: { type: "string" }, label: { type: "string" }, description: { type: "string" }, hint: { type: "string" }, isReacting: { type: "boolean" }, colors: { type: "array", items: { type: "object" } } }, required: ["reagent", "description"] } } }, required: ["source", "results"] },
        MoleculeResource: { type: "object", properties: { chemical_identifiers: { type: "object" }, schemes: { type: "object", properties: { dosewiki: ref("Link"), "effect-index": ref("Link"), "effect-index-dark": ref("Link") }, required: ["dosewiki", "effect-index", "effect-index-dark"] } }, required: ["chemical_identifiers", "schemes"] },
        Link: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        // Owning effect is optional; explicit additional tags can establish
        // collection membership even when there is no owning effect.
        //
        // `type` includes `audio`: the gallery tile, the canonical viewer and
        // the permalink all draw a clip now, so `isPublishableReplication`
        // publishes those rows and the API returns them like any other work.
        // Audio rows carry no width, height or thumbnail_url.
        Replication: { type: "object", properties: { slug: { type: "string" }, title: { type: "string" }, artist: { type: "string" }, artist_url: { type: "string", format: "uri" }, type: { type: "string", enum: ["image", "video", "audio"] }, effect_slug: { type: "string", description: "Owning effect identity, when recorded; not necessarily the requested collection." }, effect_tags: { type: "array", items: { type: "string" }, description: "Explicit additional depicted-effect identities. Not ancestors or inferred related effects. Always present, empty when no additional assignments are recorded." }, url: { type: "string", format: "uri" }, thumbnail_url: { type: "string", format: "uri" }, preview_url: { type: "string", format: "uri" }, motion_url: { type: "string", format: "uri" }, motion_poster_url: { type: "string", format: "uri" }, width: { type: "number" }, height: { type: "number" }, format: { type: "string" }, file_size: { type: "number" }, duration: { type: "number" }, has_audio: { type: "boolean" }, order_index: { type: "integer" }, rights: { type: "object", properties: { status: { type: "string" }, license_name: { type: "string" }, license_url: { type: "string" }, credit_line: { type: "string" }, source_url: { type: "string" }, rightsholder: { type: "string" } }, required: ["status"] } }, required: ["slug", "title", "artist", "type", "effect_tags", "url", "format", "rights"] },
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] }, meta: ref("Meta") }, required: ["error", "meta"] },
      },
      responses: {
        BadRequest: jsonResponse(ref("Error"), "Invalid request"), NotFound: jsonResponse(ref("Error"), "Not found"), RateLimited: { description: "Rate limit exceeded" }, Unavailable: jsonResponse(ref("Error"), "Temporarily unavailable"),
      },
    },
  }, { headers: getPublicApiResponseHeaders() });
}
