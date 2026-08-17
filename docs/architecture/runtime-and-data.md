# Runtime and Data Architecture

Last verified: 2026-03-30

This appendix holds the runtime, data-flow, auth, and integration details that support the root [ARCHITECTURE.md](../../ARCHITECTURE.md).

Update this file when route ownership, Convex read/write paths, role enforcement, or third-party integration boundaries change.

## Data Architecture

### Convex data model

Primary Convex tables:

- `substanceIndex`
- `reagentTests`
- `articleSources`
- `tripReports`
- `subjectiveEffects`
- `effectIndexArticles`
- `replications`
- `memberships`
- `indexLayouts`
- `categoryLayout`
- `siteConfig`
- `prompts`
- `quotes`
- `citationEvidence`
- `generatedPublicationOperations`
- `changelog`
- `moleculeOverrides`

### Why the Convex schema is permissive

The schema in `convex/schema.ts` validates the essential top-level shape for major tables, but many nested article fields use `v.any()`. This is a deliberate tradeoff:

- article content has many optional/legacy variations
- the article contract evolves faster than the Convex schema
- the strict content definition is maintained in Zod on the application side

This reduces schema churn but makes application-level discipline more important.

### Article schema ownership

Canonical article structure is defined in:

- `src/schema/substance.schema.ts`

Generated schema helpers live in:

- `src/data/schema/`

The canonical pharmacology target collection is
`pharmacology.binding_sites`, whose rows use `target`, optional `tag`, and the
scientifically distinct `affinity` and `efficacy` measurements. Legacy
`receptor_profile`/`receptor` records are canonicalized at read boundaries while
the bounded migration removes those storage keys.

Key article sections modeled there include:

- identification
- classification
- summary
- dosage
- duration
- subjective effects
- pharmacology
- interactions
- tolerance
- harm potential
- history/culture
- legality
- citations

### Trip report contract ownership

Trip report storage and projection contracts are centralized in:

- `convex/tripReportContract.ts` for Convex validators shared by the table schema and bulk import
- `src/types/tripReport.ts` for stored, import, public preview, public detail, and report card presentation models

Public report helpers in `lib/convex/publicData.reports.ts` project Convex records through these adapters before routes render them. Listing and contributor pages pass report card models to UI components instead of manufacturing partial full reports with placeholder timelines.

### Derived public library model

The app does not use raw articles directly for every page. It derives a higher-level library model for search and classification navigation through:

- `src/data/builders/libraryBuilder.ts`
- `src/data/builders/contentBuilder.ts`
- `src/data/builders/search.ts`

`lib/convex/publicLibrary.ts` builds and caches this derived structure from Convex data plus layout configuration.

This derived library powers:

- category detail pages
- mechanism detail pages
- classification pages
- search suggestions and search results
- effect-to-substance associations

## Data Flow

### Public page data flow

Typical public page request flow:

1. Next route receives request
2. route-level server component calls helper in `lib/convex/publicData.ts` or `lib/convex/publicLibrary.ts`
3. helper uses `lib/convex/serverClient.ts`
4. `ConvexHttpClient` queries Convex
5. route renders server-side HTML
6. Next caches/revalidates per route settings

Effect Index article routes follow the same flow through
`lib/convex/publicData.articles.ts`. The `/articles` index projects only records
whose stored `publication_status` is exactly `published`; all article slugs
remain available to static route planning, while unlisted records are excluded
from the sitemap and structured index listing.

The five curated `/psychoactive/*` subjective-effect summaries read the public
effect article projection through `lib/convex/publicData.effects.ts`, then apply
their fixed Effect Index tag/name selections in the server route loader before
rendering long-summary VCode.

### Replication publication gate

The `replications` table stores more than the site publishes as replications: an
optional `role` distinguishes an artist's rendition of a subjective effect from
an explanatory `figure` (a diagram, a chart) stored for the same rights
tracking, and `type` can be `audio`, which no surface presents yet.

`isPublishableReplication` in `src/types/replications.ts` is the single
definition of what may be published, and it is applied at the app-side read
boundary — `getPublicReplications` and `getPublicReplicationsByEffect` in
`lib/convex/publicData.effects.ts`, `getReplicationsByContributor` in
`lib/convex/publicData.replications.ts`, and the single-row check in
`loadReplicationRoute`. Those four cover every public replication surface:
gallery, effect article sections, contributor profiles, the homepage panel,
`/replications/[slug]` (with its JSON-LD and `generateStaticParams`), the
sitemap, `/api/v1/replications*`, and the About page's credit counts.

The Convex queries themselves stay unfiltered on purpose, so the rights and
provenance tooling under `scripts/replications/` still sees every stored asset,
and a future figure surface can read the same rows through its own helper.
`effect_slug` is likewise optional; consumers must tolerate its absence rather
than assume an owning effect.

### Public read-only API flow

The versioned `/api/v1` Route Handlers read through the same server-side public Convex adapters as public pages. The API exposes explicit public projections rather than raw Convex documents, applies opaque cursor pagination to collection responses, permits cross-origin read requests, and uses CDN cache headers plus the `publicContentApiRead` rate-limit policy. During the binding-sites migration, v1 alone derives the legacy `receptor_profile`/`receptor` response shape from canonical `binding_sites`/`target` data; no duplicate legacy fields are stored. The construction-host middleware allows only the `/api/v1` prefix while the rest of the public application remains gated.

### Public classification/search flow

For search and classification pages, raw articles are converted into a derived library:

1. fetch projected substance builder input and layout docs from Convex
2. normalize manual layout definitions
3. build library/index structures in memory
4. resolve page-specific detail object or search results
5. render response

The public library query transports a dedicated builder-input projection rather
than full articles. It preserves the article fields consumed by record,
taxonomy, route, citation-compatibility, and search builders while reducing
references to identity keys, dosage/duration to route data, harm potential to
addiction liability, and pharmacology to the canonical contract fields consumed
by normalization. Unknown legacy-only pharmacology keys are stripped just as
they were by the previous full-article parse. Full public articles remain on the
per-slug, About-preview, and coverage paths.

Static route planning does not build that full library. It reads a slim Convex
mechanism-route projection and feeds it through the same mechanism aggregation
function used by the library, preserving route/filter/order parity without
loading the full substance corpus. Library and route projections also share the
same canonical pharmacology view, so legacy-only mechanism keys cannot create a
route that the parsed library does not contain. The route projection
deliberately does not run the full article Zod contract inside Convex.
Consequently, a record invalid outside pharmacology can temporarily retain a
mechanism route after the validated library drops it; this avoids parsing every
full article and coupling the projection query to the full application article
contract.

The JSON-safe public route plan and browser search manifest use Next's tagged
data cache. The Map/function-bearing library and server search index remain in
process memory only. Editor saves immediately expire the shared public Convex
cache tag from the request-scoped save Route Handler and separately clear the
library/search module caches.

The About page reads full-article candidates in bounded pages, validates each
page with the normal public substance contract, filters low-priority records,
and stops once it has selected 12 previews. It reaches the full corpus only in
the worst case where validation or priority filtering requires it.
`/about/coverage` is the explicit uncached full-corpus exception: the noIndex
internal table must run the exact same section and citation rules as public
article rendering.

### Editor read flow

Editor pages use client-side Convex queries against the sole deployment,
`glad-minnow-656`:

1. user signs in through Auth.js
2. `/dev` resolves the user's owned contributor profile with
   `profileMediaWrite`; the resolver uses its scoped token when configured and
   otherwise uses `CONVEX_ADMIN_KEY`
3. an unavailable profile lookup is logged but does not prevent
   `NextDevRouteClient` from loading
4. client mounts a Convex React client from the configured browser URL, which
   must resolve to `glad-minnow-656`
5. editor reads category layout, slug map, and full article library from Convex
6. article editing remains manual in the browser; scraped `articleSources`,
   extracted quote packs, and source-backed generation are not loaded by the
   article editor
7. the editor config-health check verifies that the configured
   `CONVEX_ADMIN_KEY` is accepted by the selected deployment
8. editor state is managed through `DevModeContext` and feature-local form/tool
   state

### Editor save-to-Convex flow

The preferred live-content save path is:

1. client collects article/about/changelog payload
2. client calls `POST /api/save-to-convex`
3. route enforces rate limit
4. route requires an Auth.js editor session
5. route requires a server write URL and `CONVEX_ADMIN_KEY`; the URL must resolve
   to `glad-minnow-656`
6. each mutation uses its intent-scoped token when configured and otherwise uses
   `CONVEX_ADMIN_KEY` as the compatibility fallback
7. route writes through generated Convex mutations
8. route optionally writes changelog entry
9. route revalidates affected public paths and immediately expires tagged public
   Convex-derived data
10. route clears process-local library/search caches
11. client receives verification/revalidation metadata

This is the cleanest write path in the current system because it preserves Convex as the live store.

### Reviewed generated-section publication flow

Generated section review is split from publication and remains a local script workflow. All `articleSources` queries require authenticated Convex identity or the scoped `articleSourceMigration` token; source documents are not exposed through the browser editor. `batch:proposal` supports
summary and pharmacology adapters. It reads explicitly identified source
prompt/material and an explicit target article through a frozen query-only
Convex facade and allowlisted read API, writes an immutable local manifest before
model generation, and emits read-only review artifacts. Pharmacology reuses its
standard live prompt, source excerpt, message/parser, and OpenRouter modules but
may propose only the `pharmacology` top-level field; `dosage`, `duration`, and
unrelated changes are rejected. The post-generation artifact digest binds the
manifest digest, raw-response hash, exact base/proposed articles, approved paths,
CAS hashes, slug, and target deployment fingerprint.

`batch:publish-reviewed-section` is the only script entrypoint for later
publication. It accepts one immutable proposal at a time, revalidates its target
manifest, raw-response hash, and digest before reading the target article, and
requires an explicit reviewer identity, UTC timestamp, and a retyped matching
artifact digest. On write it requires a registered `admin` or `editor` delegated
actor, the scoped `generatedPublicationWrite` token (never the legacy key), the
standard explicit target/deployment confirmation ceremony, and the target's
`GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT`.

The mutation rejects slug or deployment mismatch and artifact substitution,
hashes only the closed profile-owned top-level fields, checks the base/proposed
diff and canonical article contract, compares the live owned hash, and patches
only approved owned fields. Full snapshots are validation guards, never patch
payloads. Successful article and `generatedPublicationOperations` audit writes
share one transaction; stale owned content returns a conflict with no write,
while concurrent unrelated-section edits survive. The publisher re-reads the
article after a successful mutation and verifies the approved section content
before it reports completion.

### Molecule depiction flow

The protected editor loads the repository-owned OpenChemLib fork from `vendor/openchemlib`; ordinary installs and deployments consume its committed browser artifacts rather than fetching upstream source or compiling Java/GWT. The editor enables the fork's continuous fine-rotation mode by default and may switch it at runtime without changing molecule data. See [DoseWiki-owned OpenChemLib fork](openchemlib-fork.md).

`moleculeOverrides` is authoritative for the editable and public molecule depiction set. One
engine draws everything: the OpenChemLib fork renders the editing canvas, the live preview, and
the stored brand SVG (`renderMoleculeSvg.ts`); RDKit.js remains only for the InChI stereo guard
and class-template alignment. Seeded rows derive a MOL block from live article SMILES through the
same OpenChemLib auto-layout used by the editor, then store the SVG produced by the same renderer
used on Save. Rows may carry `boldBonds` — bond indices the fork draws at a solid wedge's width on the
canvas, in the preview, and in the published SVG identically.

Public substance routes resolve one indexed metadata row by slug, while cached chemical-class
comparison data resolves the depiction index through `lib/convex/publicData.molecules.ts`. A
stored row uses `/api/molecules/<slug>?v=<updatedAt>`; missing rows or query failures retain the
static `public/molecules` fallback. Editor saves
revalidate the owner page. The versioned image response is immutable, so propagation is governed
by page revalidation rather than stale image bytes.

### GitHub-backed file save flow

Selected workflows still persist to GitHub-managed files:

- `POST /api/save-substance-index`
- `POST /api/save-user-profile`

These routes:

- require an editor session
- require `GITHUB_TOKEN`
- validate request payloads
- call helpers in `lib/server/github/`
- write repository files through GitHub APIs

These flows exist because not all operational/editor data has been fully consolidated behind Convex-only editing.

## Auth and Authorization

### Auth.js

Auth.js configuration lives in `auth.ts`.

Supported sign-in modes:

- editor credentials backed by server-side password env vars such as `ADMIN_PASSWORD`, `JOSIE`, or keys listed in `DEV_PASSWORD_KEYS`
- optional GitHub OAuth when configured

Session model:

- JWT session strategy
- session user object enriched with role
- role synchronized from Convex `memberships`

### Membership synchronization

On sign-in, the app syncs user identity into Convex:

- `lib/auth/convexMemberships.ts`
- `convex/memberships.ts`

Role resolution:

- `AUTH_ADMIN_EMAILS` can bootstrap first admin users
- existing membership role is preserved otherwise
- credentials-provider users receive the editor credential role
- allowed roles are `admin`, `editor`, `viewer`

### Route protection

Public route protection layers:

- `middleware.ts` protects `/dev`
- `src/lib/auth/requireEditorSession.ts` protects sensitive route handlers

This creates a consistent server-side authorization boundary for protected write actions.

## External Integrations

### Analytics and browser security policy

The self-hosted analytics script is a public-host-only integration. A client-side
host policy attaches it only on the exact `dose.wiki` and `www.dose.wiki`
hostnames, so it is absent from admin, Vercel preview, and local sessions.

Middleware applies a path- and host-aware policy. Public documents use
`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` so Next.js can serve
statically generated and ISR documents without a request-bound nonce; the policy
adds the analytics origin only on the exact public construction hosts. Protected
`/dev` documents remain request-rendered and receive a fresh nonce plus hashes for
the deterministic Zod and theme bootstrap scripts. Middleware forwards that
nonce-bearing CSP to Next.js so its framework and hydration scripts receive the
same nonce. Admin, preview, and local policies do not allow the analytics origin.

Reports are accepted at `/api/csp-report` with request-size and rate limits and
recorded as directives plus redacted origins. The separate report-only header was
retired when enforcement began; the enforced policy retains `report-uri`, so the
collector continues to receive violations without duplicate reports. API handlers
retain ownership of content-specific CSP, including `sandbox`
for database-backed SVGs. See
[Browser Security Policy](../agents/browser-security-policy.md) for the source
inventory, rationale, and validation contract.

### Convex

All local, development, Vercel Preview, and Production Convex reads and writes
use `glad-minnow-656`. Runtime target resolution lives in
`lib/convex/runtimeTargets.ts`; every configured read and write URL must resolve
to that deployment. A second dev or preview deployment is not part of the
runtime architecture.

Used for:

- public content reads
- editor data reads
- live content writes
- role/membership data
- prompts, quotes, and site config

Prompt seed markdown under `src/data/config/generatorPrompt.md` and
`src/data/config/sectionPrompts/*.md` is compared and migrated through the shared
prompt drift Module in `scripts/lib/prompt-drift-policy.mjs`. The compare and
migration scripts use the same local inventory, so `generator` and `section_*`
prompt keys are included in drift reports before Convex writes.

### GitHub

Used for:

- selected file-backed persistence flows
- `SubstanceIndex.json`-style history paths
- user profile file updates

### Upstash Redis

Used when configured for:

- API rate limiting in Next route handlers

Fallback behavior:

- if Upstash is not configured or unavailable, rate limiting falls back to in-memory counters

Rate-limit intent policies live in `lib/http/rateLimitPolicy.ts`. Routes select named policies such as `editorHeavyWrite`, `editorSmallWrite`, `authenticatedProfileWrite`, `publicProxyRead`, `diagnosticRead`, and `publicSearchRead`; storage details stay behind the Upstash and in-memory adapters in `lib/http/nextRateLimit.ts`.

### ProtestKit reagent-test snapshot

ProtestKit is an explicit offline ingestion source, not a runtime dependency. With the API owner's permission, `npm run reagents:cache` writes a slug-keyed point-in-time snapshot to `src/data/reagentTests.json`. `npm run reagents:import` validates and upserts all matched and no-match records into the indexed Convex `reagentTests` table.

Public substance route loaders read one record by canonical DoseWiki slug through `lib/convex/publicData.reagents.ts`; authored `substanceIndex.reagent_testing` content remains authoritative when present. The legacy-path `src/app/api/reagent-proxy/route.ts` is retained for editor and client-preview compatibility, but it now reads Convex and performs no ProtestKit egress. It continues to apply rate limiting, CORS origin policy, and cache headers.
