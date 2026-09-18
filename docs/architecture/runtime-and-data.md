# Runtime and Data Architecture

This appendix holds the runtime, data-flow, auth, and integration details that support the root [ARCHITECTURE.md](../../ARCHITECTURE.md).

Update this file when route ownership, Postgres read/write paths, role enforcement, or third-party integration boundaries change.

## Data Architecture

### Postgres document model

Primary Postgres tables:

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

### Why the document schema is permissive

The schema in `server/schema.ts` validates the essential top-level shape for major tables, but many nested article fields use `v.any()`. This is a deliberate tradeoff:

- article content has many optional/legacy variations
- the article contract evolves faster than the document schema
- the strict content definition is maintained in Zod on the application side

This reduces schema churn but makes application-level discipline more important.

### Maintained public read indexes

The expensive public reads use compact derived relations, not repeated scans
of unrelated heavy source documents:

- `replicationGalleryCandidates`: indexed drug/class/direct-slug candidate
  lookup, canonical matching and curation, then winner-only hydration.
- `articleHistory`: per-article chronological links, followed by hydration of
  only the requested history entries.
- `reviewedArticles`: compact completed-review records, indexed by normalized
  reviewer identity; public results never expose those emails. Stamps made
  under a retired login handle attribute to the live profile through the
  server-only `LEGACY_CONTRIBUTOR_HANDLE_GROUPS` variable (`;`-separated
  groups of `,`-separated handles), never through stored aliases, which
  unauthenticated profile reads ship verbatim.
- `tripReportSubstances`: the existing report-substance relation, now gated by
  verified full-pass completion rather than the presence of any row.

`publicReadIndexState` holds versioned readiness and durable backfill cursors.
`server/lib/indexedMutation.ts` supplies the application mutation builders and
intercepts indexed source inserts, relevant patches, replacements, and deletes
in the same transaction. Both root and table-scoped writer APIs preserve this
maintenance boundary. Imported handlers inherit it. An index-write failure
rejects the enclosing mutation even if bulk row handling catches the immediate
error, preventing a successful source write with an incomplete derived index.

Backfill page writes and cursor advancement commit atomically. Only the final
source page marks an index ready. Membership changes, deletion, and concurrent
writes remain covered during a pass. A policy change that alters derived keys
requires a `PUBLIC_READ_INDEX_VERSION` increment and new complete passes.
Direct SQL or snapshot imports bypass these mutation builders and are not
valid source-table maintenance paths without the approved index rebuild.

#### Public read-index rollout

The indexed readers and atomic maintenance are implemented in the checkout;
their release and data backfills are separate production operations. Follow
[data credentials](../operations/data-credentials.md) and obtain explicit authorization for
the exact deployment and write batch.

1. Confirm that the public frontend supports the complete shared
   gallery-corpus fallback before activating the new backend readiness
   condition. If not, stage the fallback-aware frontend first.
2. Use `scripts/data-ops/backfill-trip-report-substance-index.mjs` with
   `--index=history`, then `--index=gallery`, `--index=reviews`, and
   `--index=tripReports`, against an explicit `TARGET_POSTGRES_URL`. Run each
   with `--dry-run` first. It prints the exact operation confirmation and
   deployment fingerprint required for `--write`. Gallery/history/reviews
   additionally require `--confirm-public-read-index-backfill`; tripReports
   retains `--confirm-trip-report-substance-index-backfill`.
3. Use bounded batches, such as `--batch-size=25 --max-pages=100`, and resume
   from the server-owned checkpoint until every status reports
   `indexActive: true` for the current version. A nonempty relation or a
   successfully completed partial batch is not readiness. Never invent or
   advance a cursor manually.
4. Complete the authorized Next rollout for both projects, then verify public
   gallery membership/order, history, contributor credits, report matching,
   and edit/removal freshness on their canonical hosts. Backend readiness and
   cache key changes do not certify cross-host or cross-project invalidation.
5. Compare at least one complete UTC day of per-function calls, database bytes,
   cache behavior, and warmer activity against the dated baseline. Source
   improvements are not measured savings.

Before readiness, gallery reads use the existing shared paged corpus;
history, review, and report reads retain complete source fallbacks. Those
fallbacks are not service-limit-proof, so backfill history promptly and keep
the rollout window short. Direct SQL or snapshot imports bypass application
index maintenance and must not modify the indexed source tables.

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

- `server/tripReportContract.ts` for native validators shared by the table schema and bulk import
- `src/types/tripReport.ts` for stored, import, public preview, public detail, and report card presentation models

Public report helpers in `lib/data/publicData.reports.ts` project backend records through these adapters before routes render them. Listing and contributor pages pass report card models to UI components instead of manufacturing partial full reports with placeholder timelines. Substance articles reuse compact related-report cards for both table-of-contents membership and the report section. The Postgres reader excludes report narratives even when the related-report join index is not ready.

### Derived public library model

The app does not use raw articles directly for every page. It derives a higher-level library model for search and classification navigation through:

- `src/data/builders/libraryBuilder.ts`
- `src/data/builders/contentBuilder.ts`
- `src/data/builders/search.ts`

`lib/data/publicLibrary.ts` builds and caches this derived structure from the Postgres public read adapter plus layout configuration.

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
2. route-level server component calls helper in `lib/data/publicData.ts` or `lib/data/publicLibrary.ts`
3. helper uses `lib/data/serverClient.ts`
4. with `DATA_BACKEND=postgres`, the helper executes the registered handler in-process against the Postgres adapter
5. route renders server-side HTML
6. Next caches/revalidates per route settings

Effect Index article routes follow the same flow through
`lib/data/publicData.articles.ts`. The `/articles` index projects only records
whose stored `publication_status` is exactly `published`; all article slugs
remain available to static route planning, while unlisted records are excluded
from the sitemap and structured index listing.

The five curated `/psychoactive/*` subjective-effect summaries read the public
effect article projection through `lib/data/publicData.effects.ts`, then apply
their fixed Effect Index tag/name selections in the server route loader before
rendering long-summary VCode.

### Replication publication gate

The `replications` table stores more than the site publishes as replications: an
optional `role` distinguishes an artist's rendition of a subjective effect from
an explanatory `figure` (a diagram, a chart) stored for the same rights
tracking.

`isPublishableReplication` in `src/types/replications.ts` is the single
definition of what may be published, and it is applied at the app-side read
boundary, `getPublicReplications` and `getPublicReplicationsByEffect` in
`lib/data/publicData.effects.ts`, `getReplicationsByContributor` in
`lib/data/publicData.replications.ts`, and the single-row check in
`loadReplicationRoute`. Those four cover every public replication surface:
gallery, effect article sections, contributor profiles, the homepage panel,
`/replications/[slug]` (with its JSON-LD and `generateStaticParams`), the
sitemap, `/api/v1/replications*`, and the About page's credit counts.

The native queries themselves stay unfiltered on purpose, so the rights and
provenance tooling under `scripts/replications/` still sees every stored asset,
and a future figure surface can read the same rows through its own helper.
`effect_slug` is likewise optional; consumers must tolerate its absence rather
than assume an owning effect.

Publication and drawability are separate questions. `type` may be `audio`, and
an audio row is publishable: it is served by `/api/v1/replications*`, owns a
`/replications/[slug]` permalink, appears under its effect article's
Replications section and on the `/replications/audio` index, all through the
shared `AudioReplicationPlayer`. Every *frame* surface (the `/replications`
explorer and its focus views, the immersive viewer, the substance showcase, the
contributor works rail, the Effect Index homepage carousel) narrows further
with `isVisualReplication` from the same module, so an audio row is never
handed to an `<AppImage>`. A new frame surface must filter with that helper
rather than restate the kinds.

### Safety banner rendering

Substance safety banners are opt-in per preset and resolve by slug, never by
classification. `presetAppliesToSlug` in `src/data/substanceWarningBanners.ts`
is the render rule: a preset applies when it is enabled and either
`allSubstances` is set or the slug is in its `enabledSlugs` list (capped at
`MAX_ENABLED_SLUGS`, 250). Classification strings are Banner Studio search
aids and never reach the render path. An article shows at most
`MAX_BANNERS_PER_ARTICLE` (2) banners, ordered by tone (danger, then unsafe,
then caution) and then key; there is no priority field, and two same-tone
banners on one substance are resolved by an editor disabling one.

`lib/next/warningBanners.ts` reads presets under
`PUBLIC_DATA_CACHE_TAGS.banners` and deliberately degrades to an empty list
with a logged warning when the read fails; there is no checked-in fallback.
The Banner Studio save route revalidates that tag plus every affected slug.
Glyph size is one sitewide `safety-banner-display` siteConfig value shared by
every banner, never a per-preset setting. `/dev/banners` is admin-gated.

### Public read-only API flow

The versioned `/api/v1` Route Handlers read through the same server-side public data adapters as public pages. The API exposes explicit public projections rather than raw stored documents, applies opaque cursor pagination to collection responses, permits cross-origin read requests, and uses CDN cache headers plus the `publicContentApiRead` rate-limit policy. During the binding-sites migration, v1 alone derives the legacy `receptor_profile`/`receptor` response shape from canonical `binding_sites`/`target` data; no duplicate legacy fields are stored. The construction-host middleware allows only the `/api/v1` prefix while the rest of the public application remains gated.

### Public classification/search flow

For search and classification pages, raw articles are converted into a derived library:

1. fetch projected substance builder input and layout docs from Postgres
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

Static route planning does not build that full library. It reads a slim Postgres
mechanism-route projection and feeds it through the same mechanism aggregation
function used by the library, preserving route/filter/order parity without
loading the full substance corpus. Library and route projections also share the
same canonical pharmacology view, so legacy-only mechanism keys cannot create a
route that the parsed library does not contain. The route projection
deliberately does not run the full article Zod contract inside the handler.
Consequently, a record invalid outside pharmacology can temporarily retain a
mechanism route after the validated library drops it; this avoids parsing every
full article and coupling the projection query to the full application article
contract.

Public route plans and search manifest/suggestion composition use request
memoization, not an outer persistent cache that would bypass Next's nested
leaf caches. The bounded source pages and public leaves use `publicDataCache`,
with backend, selected target identity, callback identity, and arguments in
the key. Lookup, slug, and preview reads use field-specific Postgres
projections rather than transporting complete article documents. Index counts
read their own canonical membership, not unrelated public corpora.

Library and mechanism input pages persist separately, including on cold
instances. Derived library and search caches check a shared Next Data Cache
revision identity before reusing process-local values. Concurrent refreshes
share one in-flight computation per identity; superseded computations cannot
repopulate the current cache.

Persistent values are size-checked as escaped UTF-8 JSON. Oversized results
store only a bounded bypass sentinel and return complete uncached content;
successful stale refreshes therefore replace the old value instead of pinning
it through a swallowed cache error. Gallery query/index unavailability stores
an explicit `null` marker and selects the complete shared corpus outside the
persistent leaf. It never means an empty gallery.

Editor saves expire the affected article and full-document caches. Publication
targets distinguish detail-only changes, collection content changes, and
membership changes. Detail-only edits preserve unchanged membership and search
projections. Summary and other projected-content edits refresh their consumers;
identity, visibility, association, locale, and unclassified changes use the
conservative membership path. Pending outbox dependencies can broaden but
cannot narrow when later writes coalesce.

The same signed content identities reach both public Vercel projects. Indexed
public writes also coalesce identities transactionally into the Postgres
publication outbox; leased recovery retries incomplete delivery without
carrying content. Article receipts verify the committed revision against
canonical public HTML, separately from accepting cache invalidation. The
default leaf interval remains 900 seconds, and the showcase endpoint's
browser/CDN cache headers are unchanged.

The About page reads full-article candidates in bounded pages, validates each
page with the normal public substance contract, filters low-priority records,
and stops once it has selected 12 previews. It reaches the full corpus only in
the worst case where validation or priority filtering requires it.
`/about/coverage` is the explicit full-corpus exception: the noIndex internal
table must run the exact same section and citation rules as public article
rendering. Coverage and full-document exports persist bounded four-document
source pages on the separate substance-document tag, which every article
publication expires.
Request memoization composes those leaves, so an export larger than the cache
envelope does not force every regeneration to drain the source corpus again. Individual
oversized pages retain the bounded-sentinel fallback above. Download statistics
likewise compose cached leaves without an outer persistent cache; rendered
page revalidation retains the displayed labels.

### Public browser startup

Gallery startup retains the server's bounded preview rails and requests
64-work continuation pages with complete result counts, group summaries, and
filter facets. It does not download the complete gallery corpus on idle.
Search, sort, artist/effect focus, and locale remain attached to continuation
requests. Viewer resolution has independent request ownership so a linked
work cannot replace the browsed page or be lost to a stale response. Gallery
HTTP responses use `private, no-store`; server reads retain their existing
publication-aware caches.

Gallery and showcase launchers import the fullscreen viewer only on intent.
The loading dialog includes a recoverable chunk-error state and restores the
launcher's focus when closed. Search focus or an explicit search action starts
one shared manifest load per locale; ordinary reading does not warm it.
Public links and programmatic search transitions share pending-navigation
feedback, with independent ownership for overlapping transitions.

### Public page loading

- Keep substance narrative and safety warnings, and effect article prose, in
  server-rendered components. `SubstanceSecondarySections` and
  `EffectArticleServer` compose secondary data behind separate Suspense boundaries;
  editor builds retain resolved enrichment for mutable draft previews. ISR routes
  still await the complete render on a cold miss, so these boundaries alone do
  not guarantee early HTTP streaming.
- Use `SmartLink` for secondary navigation and documentation links. Its default
  prefetch is driven by hover or focus, not viewport visibility. Reserve eager
  prefetch for deliberate high-intent destinations.
- Keep `AppearancePanel` behind the settings popover's dynamic import and Theme
  Lab styles with the lazy lab component. Opening controls must remain usable
  after their code arrives.
- Replication showcases keep a responsive poster until video data is ready.
  Muted autoplay uses an existing preview rendition where available; explicit
  playback or sound intent selects the full work. Preserve viewport,
  reduced-motion, data-saver, and `preload="none"` behavior.
  While the poster or initial motion frame loads, use the index thumbnail's
  shared shimmer treatment, not an unavailable-media card. Reserve error
  placeholders for confirmed failures, stop shimmer when media is ready, and
  respect reduced motion without adding an artificial loading delay.
- Gallery SSR and API pagination share `getGalleryBrowsePage`. The default artist
  view opens with 16 rails and at most 14 previews per rail; focused and filtered
  grids retain 64-work pages. Hydration must reuse a matching bootstrap rather
  than replace it. Cursor identity includes query, locale, and corpus revision;
  stale or mismatched cursors recover through a fresh first page.
- Effect membership uses the compact native SQL projection and revision-aware
  cache, not complete substance documents. Effect media reads are scoped to the
  requested effect; replication details and effect order metadata use batched
  native lookups. Preserve the complete viewer collection and publication guards.
- Documentation Mermaid code loads only when a diagram approaches within 400px
  of the viewport. Retain reserved space, theme updates after activation, stale
  render guards, and immediate rendering when IntersectionObserver is unavailable.

### Reading-page editor launcher

The bottom-right wrench appears only for contributor-or-higher sessions on the
two approved editor hosts. On the homepage it replaces the mailing-list entry
point; pending, failed, anonymous, and viewer sessions retain the mailing list.
The launcher is absent within editor, review, and authentication flows. Public
DoseWiki hosts and Effect Index do not load its session subtree or issue its auth
requests. The browser editor hint is not a prerequisite.

All actions are native links to existing editors, filtered by the dev registry's
role floors. This is a navigation convenience, not a new authorization boundary
or write API. Pages declare loaded record identity through
`src/features/editor-launcher/EditorLauncherTarget.tsx`; no arbitrary pathname
is interpreted as a substance.

| Reading surface | Contextual destination |
| --- | --- |
| Substance article | Substances for editor/admin; Molecules and Citations for admin |
| About | Pinned About record in Writing for editor/admin |
| Markdown `/articles/[slug]` and DoseWiki `/blog/[slug]` | Matching Writing record and kind for editor/admin |
| Open substance-scoped replication viewer | Matching substance in Replications for admin |
| VCode/unspecified writing formats, artist/effect/unscoped galleries | All dev tools only; no writable exact handoff |
| Reports, effects, chemical classes, taxonomy, indexes, search, contributors, static/form/multi-copy pages | All dev tools only |
| Redirect-only addresses | Destination owns context |
| Effect Index | No launcher |

The replication viewer hosts the same launcher inside its modal focus boundary.
Its menu portal remains inside that outlet for native fullscreen, and launcher
keyboard events do not drive viewer navigation. The existing inline gallery
editor and its desktop restriction are unchanged. Dev edits still target
production data; following a shortcut does not save anything.

### Editor read flow

Editor pages hold no data-backend client in the browser. Every read is a
TanStack Query over a session-gated Next route that runs the registered query
through the server read client (`getServerDataReadClient()`) and the in-process
Postgres runtime under `DATA_BACKEND=postgres`:

1. user signs in through Auth.js
2. `/dev` resolves the user's owned contributor profile with
   `profileMediaWrite`; the resolver uses its scoped token when configured and
   otherwise uses `DATA_ADMIN_KEY`
3. an unavailable profile lookup is logged but does not prevent
   `NextDevRouteClient` from loading
4. `src/hooks/useEditorRead.ts` keys each read `["editor", "<module>:<fn>", args]`
   and fetches it from the matching `GET /api/editor/*` route (index layouts,
   category layout, contributor profiles, change log, copy blocks, molecule
   depictions, substance documents and cursor pages, banner display); the
   shared `editorReadRoute` helper applies the role floor, the
   `editorPolledRead` rate policy, and refuses a foreign `Origin` or a
   cross-site `Sec-Fetch-Site`
5. freshness (fork F3, conservative option): refetch on window focus plus a
   15 s interval for lists and 5 s for the open document; a caller's own write
   invalidates its keys immediately; there is no push
6. the editor library itself drains `/api/dev/editor-library`, and editor-only
   projections keep their existing `/api/dev/*` routes
7. article editing remains manual in the browser; scraped `articleSources`,
   extracted quote packs, and source-backed generation are not loaded by the
   article editor
8. the editor config-health check verifies that the configured
   `DATA_ADMIN_KEY` is accepted by the selected deployment
9. editor state is managed through `DevModeContext` and feature-local form/tool
   state; a refetch only reaches the working set when the row's identity
   changed, so unsaved drafts survive polling and tab switches

### Editor save-article flow

The preferred live-content save path, for an admin session, is:

1. client collects article/about/changelog payload
2. client calls `POST /api/save-article`
3. route enforces rate limit
4. route requires an Auth.js admin session
5. route requires `POSTGRES_POOLED_URL` and the editor credential tier on
   `dosewiki-admin`, with the global write freeze enforced
6. each mutation uses its intent-scoped token when configured and otherwise uses
   `DATA_ADMIN_KEY` only where the intent policy permits a general-key fallback
7. route invokes authored Postgres mutations through generated callable references
8. route optionally writes changelog entry
9. route revalidates affected public paths and immediately expires tagged public
   database-derived data
10. route clears process-local library/search caches
11. client receives verification/revalidation metadata

This path preserves the native Postgres write, authorization, and publication boundaries.

Cross-project publication is owned by the durable outbox, not a direct editor
cache expiry. `src/app/api/cron/publication-delivery/route.ts` awaits
`enqueueTranslationJobs` in `lib/translation/segmentStore.ts` before dispatch.
The enqueue and publication-generation receipt commit atomically; replay neither
resets newer locale work nor loses the receipt when `server/publicationRecovery.ts`
records delivery. Enqueue failure keeps the outbox pending. Cache-only refresh
retains its existing behavior without translation enqueueing. Locale lease,
bounded failure and old-worker drain requirements are owned by
[Durable refresh and rollout](../operations/locale-mirrors.md#durable-refresh-and-rollout).

### Editor proposal flow

An editor session sees the same commit panel, but its primary action reads
"Submit for review" and nothing it does writes production:

1. client builds the `SaveArticlePayload`, a one-line summary, and
   `baselines: [{ kind, key, document }]` from the originals actually loaded
   into the editor. Dirty drafts retain those originals across live refreshes.
2. client calls `POST /api/dev/proposals` (editor floor)
3. route sanitizes the payload with the save-article utilities and forwards
   it with the loaded baselines. A client-supplied diff is not accepted.
4. `changeProposals.submit` (editor floor) validates the payload with the save
   validators and article ingestion contract, derives its targets, and compares
   each loaded baseline with current production. A stale baseline returns
   `PROPOSAL_BASELINE_STALE` (HTTP 409); the editor keeps the unsaved draft.
   On a match, the server records each target's `contentHash` as `baseHash`,
   generates the comparison from the actual write semantics, and inserts the row with
   status `submitted`. An article that carries an id is pinned to the slug the
   id-row currently has; a payload that would move it to another slug is
   refused (`PROPOSAL_SLUG_MOVE`), since renames go through the admin save. A
   revision (`revisionOf`) must share at least one target with the proposal it
   supersedes (`PROPOSAL_REVISION_MISMATCH`).
5. the panel marks the submitted draft saved and links to My submissions.
   Submitting does not publish the changes.
   Loading a proposal into the editor is refused while article or layout drafts
   contain unsaved changes, so preparing a revision cannot overwrite other work.

`/dev/queue` appears under Intake as **Change Review** for admins and **My
submissions** for editors. The handler scopes list, count, detail, and comments to
the editor's own proposals; admins see the global queue. Default lists retain
all active proposals plus bounded terminal history. Pending count badges refresh
when the window regains focus and once per minute while visible, and their
cache is scoped to the signed-in account. They are in-app counts, not email or
push notifications.

The detail comparison is generated on the server. New submissions retain a
server-marked comparison captured at submission; published or reverted history
uses `snapshotBefore`. Older active proposals are compared only when live hashes
still verify their pinned baseline. Otherwise the UI reports that the historical
comparison is unavailable rather than trusting the old client diff.

Article comparisons and new `snapshotBefore` entries retain the stored article,
not the editor projection. Updates use the same changed-unit validation as the
actual article patch, so an unrelated legacy route or country is neither
ingestion-normalized nor reported as deleted. Existing proposal CAS identities
still use the editor projection; capturing raw snapshots does not invalidate
previously submitted hashes. Older stored comparisons and projected snapshots
cannot recover source distinctions that were never captured.

Status moves only along `lib/proposals/proposalStatus.ts`. Review is admin
floor and lives in `server/changeProposalReview.ts`, reached through
`POST /api/dev/proposals/<id>/approve|reject|revert`:

- **approve** requires a different admin from the proposer and applies in the same mutation. It re-reads every target with
  `readProposalTarget`, and if any `contentHash` differs from the recorded
  `baseHash` the proposal flips to `changes_requested` with the drifted targets
  in `conflictReason` and nothing else is written. On a clean match the live
  documents are kept as `snapshotBefore`. Existing articles use contextual
  changed-unit patches and the article revision journal; new articles use
  `saveSubstancesHandler`. Layouts use `saveIndexLayoutHandler`, which mirrors
  into `categoryLayout`. Then
  a changelog entry stamped "proposed by / approved by" is upserted through
  `addEntryHandler` with the proposer's submitter key, the post-apply hashes
  are stored as `appliedHashes`, and the mutation returns the public paths the
  route then revalidates with the save route's `revalidateSavedPaths`.
- **reject** requires a note and moves any open proposal to `rejected`.
- **revert** is only allowed from `applied` and is the mirror CAS: every target
  must still hash to its `appliedHashes` entry, otherwise `REVERT_CONFLICT`
  refuses and nothing is written. It writes `snapshotBefore` back through the
  same handlers (a target that was absent before is deleted; a psychoactive
  layout that was absent also restores or clears the `categoryLayout` mirror
  captured beside it), then checks that every article hashes back to its
  `baseHash` and throws `REVERT_INCOMPLETE` (rolling the mutation back) when
  restoration fails to recover the recorded baseline. It appends a
  "Reverted proposal" changelog entry.

`applyTarget` in `server/lib/changeProposalApply.ts` is the one switch on
target kind, including articles, index layouts, About, and copy blocks.

### Reviewed generated-section publication flow

Generated section review is split from publication and remains a local script workflow. All `articleSources` queries require authenticated identity or the scoped `articleSourceMigration` token; source documents are not exposed through the browser editor. `batch:proposal` supports
summary and pharmacology adapters. It reads explicitly identified source
prompt/material and an explicit target article through a frozen query-only
data facade and allowlisted read API, writes an immutable local manifest before
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
used on Save. Rows may carry `boldBonds`, bond indices the fork draws at a solid wedge's width on the
canvas, in the preview, and in the published SVG identically.

Public substance routes resolve one indexed metadata row by slug, while cached chemical-class
comparison data resolves the depiction index through `lib/data/publicData.molecules.ts`. Those
reads and the SVG served by the three public molecule routes persist through `publicDataCache`, so
a warm request inside the revalidate window makes no database call. A transport failure is never
persisted: the index reads degrade to the static fallback and the image routes answer 502/503. A
stored row uses `/api/molecules/<slug>?v=<updatedAt>`; missing rows or query failures retain the
static `public/molecules` fallback. Editor saves revalidate the owner page and expire
`data-public:molecules:<slug>` plus `data-public:molecules`. The versioned image response is
immutable, so propagation is governed by page revalidation rather than stale image bytes.

## Auth and Authorization

### Auth.js

Auth.js configuration lives in `lib/auth/authOptions.ts`.

Sign-in is a single credentials provider: username + password. Accounts live in
the Postgres `memberships` table with a scrypt password hash
(`lib/auth/passwords.ts`); nothing about an account lives in env.

Session model:

- JWT session strategy
- session user object enriched with role
- role re-read from Postgres `memberships` on every JWT refresh; a banned member
  degrades to `viewer` on the next request

### Membership lookup

- `lib/auth/memberships.ts` wraps the server-key Postgres calls
- `server/memberships.ts` exposes `getCredentialsByUsername`, `touchSignIn`,
  `getByEmail`, and the seed/migration mutations `setAdminAccount` and
  `retireViewerMemberships`

Role resolution:

- the stored membership role is the session role; nothing in env grants admin
- the first admin accounts are seeded with `scripts/auth/seed-admin-accounts.mjs`
- roles are `admin`, `editor`, `contributor`; `viewer` survives only as a legacy
  stored value and grants nothing

### Route protection

Public route protection layers:

- `src/middleware.ts` protects `/dev`
- `src/lib/auth/requireEditorSession.ts` protects sensitive route handlers

This creates a consistent server-side authorization boundary for protected write actions.

## External Integrations

### Analytics and browser security policy

The self-hosted analytics script is a public-host-only integration. A client-side
host policy attaches it only on the exact `dose.wiki` and `www.dose.wiki`
hostnames, so it is absent from admin, Vercel preview, and local sessions.

For browser-header changes, follow [Browser Security Policy](../operations/browser-security-policy.md).
It owns public inline-compatible static/ISR rendering, editor nonces and
flavor-dependent bootstrap hashes, Turnstile, editor-only upload origins, and
the replication embed's exact framing exception. Source lists are owned by
`lib/next/cspObservationPolicy.ts`, not a second architecture inventory.

Reports are accepted at `/api/csp-report` with request-size and rate limits and
recorded as directives plus redacted origins. The separate report-only header was
retired when enforcement began; the enforced policy retains `report-uri`, so the
collector continues to receive violations without duplicate reports. API handlers
retain ownership of content-specific CSP, including `sandbox`
for database-backed SVGs. See
[Browser Security Policy](../operations/browser-security-policy.md) for the source
inventory, rationale, and validation contract.

### Runtime store: PlanetScale Postgres

Since 2026-09-10 every deployment sets `DATA_BACKEND=postgres` and reads and
writes the PlanetScale database through `lib/postgres/runtime/`: the `server/` query and mutation
handlers run in-process against Drizzle-generated tables
(`lib/postgres/schema.generated.ts`) with a lossless document codec, the
pre-cutover `_id` values preserved, and `ctx.storage.getUrl` answered from
`storageObjects` identity rows that point at R2. `lib/postgres/runtime/backend.ts`
selects the backend; `deploymentEnv.ts` asserts the per-tier variables. The
production write ceremony for scripts is in
[data credentials](../operations/data-credentials.md).

There is no alternate database backend or runtime mode. Application rollback
restores a previous compatible Postgres artifact and configuration; any
exceptional database recovery requires separate owner authorization.

Used for:

- public content reads
- editor data reads
- live content writes
- role/membership data
- prompts, quotes, and site config

Prompt seed markdown under `content/prompts/generator.md` and
`content/prompts/sections/*.md` is compared and migrated through the shared
prompt drift Module in `scripts/lib/prompt-drift-policy.mjs`. The compare and
migration scripts use the same local inventory, so `generator` and `section_*`
prompt keys are included in drift reports before production writes.

### Upstash Redis

Used when configured for:

- API rate limiting in Next route handlers

Fallback behavior:

- if Upstash is not configured or unavailable, rate limiting falls back to in-memory counters

Rate-limit intent policies live in `lib/http/rateLimitPolicy.ts`. Routes select named policies such as `editorHeavyWrite`, `editorSmallWrite`, `publicProxyRead`, `diagnosticRead`, and `publicSearchRead`; storage details stay behind the Upstash and in-memory adapters in `lib/http/nextRateLimit.ts`.

### ProtestKit reagent-test snapshot

ProtestKit is an explicit offline ingestion source, not a runtime dependency. With the API owner's permission, `npm run reagents:cache` writes a slug-keyed point-in-time snapshot to `data/third-party/protestkit/reagentTests.json`. That directory is gitignored: the dataset is used with permission and cannot be redistributed, so the snapshot lives only on the operator's workstation and `npm run reagents:import` refuses to run until it has been fetched. The import validates and upserts all matched and no-match records into the indexed Postgres `reagentTests` table.

Public substance route loaders read one record by canonical DoseWiki slug through `lib/data/publicData.reagents.ts`; authored `substanceIndex.reagent_testing` content remains authoritative when present. The legacy-path `src/app/api/reagent-proxy/route.ts` is retained for editor and client-preview compatibility, but it now reads Postgres and performs no ProtestKit egress. It continues to apply rate limiting, CORS origin policy, and cache headers.
