# Locale mirrors (zh.dose.wiki and ru.dose.wiki)

Unlisted, machine-translated mirrors of dose.wiki for readers who share the
language. One subdomain per locale. The route registry includes Simplified
Chinese and Russian. A new mirror needs its catalog, compact publication index,
production build, and verified domain binding before it can serve readers.

The translator review UI and release checks are documented in the
[translation workbench runbook](../workflows/translation-workbench.md).

## What it is and is not

- **Not a parallel database.** There is no Chinese copy of any record. The
  store is an overlay: `translationSegments(locale, hash, source, target,
  model, prompt_version)` keyed by a content hash of each English leaf. A page
  render segments the live English record exactly as the batch pipeline does,
  looks up the hashes, and splices the stored targets over a clone. A hash the
  store lacks renders in English. Identical English anywhere in the corpus is
  one row.
- **English is the only baseline.** Article prose is translated from English; contextual UI wording and glossary terms can be edited directly in the review workbench. An English
  edit changes the hash of the edited leaf; only that leaf goes back to the
  model. Untouched leaves keep their stored translation.
- **One engine and prompt contract.** `scripts/translation/locales.mjs` owns
  locale models, prompts and register rules; callers use `scripts/translation/engine.mjs`.
  Rows bind `prompt_version` to model, prompt and approved glossary. Prompt or
  glossary changes require the scoped retranslation review below, not automatic writes.
- **Canonical terms.** The glossary lives in Postgres
  (`translationGlossary`, migration `0008`; `lib/translation/glossary.ts`):
  one row per locale and term with `target`, `kind`, `status` (`draft` |
  `approved`), `source` (`model` | `human`), and who reviewed it. Only
  approved rows reach a prompt or the digest. It is reviewed in
  `/dev/glossary` by admins or Translators assigned that language: save a draft, then explicitly approve the saved revision. Draft corrections retain the effective approved rendering. Editor and Translator are independent
  checkboxes; both are persisted as `editor_translator`, with `glossaryLocales`
  carrying the approved language codes. Editor alone grants no translated
  glossary access. Missing legacy scope grants no language until an admin
  assigns one. The same grants travel through invites and each Auth.js refresh;
  failed membership reads and bans clear both roles and scope. List, edit,
  approval, CSV import, and CSV export enforce the language on the server.
  In the column-based Postgres runtime, migration `0016` adds nullable JSON
  language arrays to memberships and invites; apply it before releasing these
  readers. No role or permission backfill is performed.
  Only approved terms reach translation prompts; remaining drafts block starting
  the locale. Review machine drafts in the editor and preserve reviewer identity.
  `lib/translation/glossary.ts` owns glossary loading, and the locale prompt owns
  Latin-script exceptions. An exported glossary is a diff artifact, not runtime truth.
- **One term matcher.** `termMatcher` / `mentionsTerm` in
  `scripts/translation/term-match.mjs` decide whether English text mentions a
  glossary term: whole word, case insensitive, plus plurals and the -ing, -ed,
  and -ion forms of each word ("phenidates" mentions Phenidate, "replicating"
  mentions Replication, "lightheaded" does not mention Light). Synonyms are not
  inflections. The batch prompt lists each segment's own matched terms under
  its id, so a term never reaches an unrelated segment in the same batch;
  `GLOSSARY_MISS`, the QA packet, coverage, the UI catalog compiler, and the
  scoped stale replay use the same matcher. The batch layout and the matcher
  are not part of `prompt_version`, which still covers model, system prompt,
  approved glossary, and glosses.
- **Source context.** Public/editor glossary links load on demand and are derived
  from canonical registries and public article content rather than stored alongside
  definitions. Counts describe unique source locations, not repeated mentions.
- **Shared renderings.** Separate terms of one kind that would share a target
  remain blocked by default. A translator can explicitly choose "Allow shared
  rendering" after reviewing the exact locale, target, and English terms.
  This applies to edits, individual/bulk approvals, and CSV import. Confirmation
  is bound to the current collision set; a changed set requires another review.
  Singular/plural variants keep their existing exemption. Cancellation writes
  nothing, model drafts cannot override the guard, and accepted human writes
  retain reviewer identity and time. API retries carry `collisionConfirmation`
  for JSON requests or `X-Glossary-Collision-Confirmation` for raw CSV; both
  accept only the 64-character digest supplied by the refused request.

## Deferred GT inputs

The `gt-next` package dependency is intentionally deferred (the `gt` package
and `gt.config.json` are already gone). The current locale mirrors do not import
it or use GT at runtime, and `knip.config.js` ignores it for that reason. Keep it
until its intended integration or retirement and source/provenance requirements
are resolved. Its presence does not mean GT serves production.

## Shape

| Piece | Where |
| --- | --- |
| Host to locale, route prefix, localized paths | `lib/next/localeHostPolicy.ts` (`zh.dose.wiki` to `zh-Hans`, `/zh`) |
| Request routing | `src/middleware.ts`: mirror-host paths in the public corpus rewrite to `/zh/...` (the query string survives, so `/search?q=` keeps its query); paths outside it rewrite to `/zh/unroutable/missing` with a 404 status; `/zh/...` on any other host is a real 404. The root `not-found.tsx` must never read request APIs (that turned every static mirror route dynamic and crashed it) |
| Pages and record kinds | Inspect `src/app/zh/`, `lib/translation/liveTranslation.ts` and `scripts/translation/corpora.mjs` for the selected route/kind. Preserve identity fields; translate only the declared text projection. |
| Reads | `lib/translation/localizedRecords.ts` (cached `getLocalizedPublic*`), consumed by `lib/next/routeLoaders.*`; contributor localization projects each profile to `{slug, bio}` so names, roles, links, and identity fields stay canonical. The substance page's related-report rail localizes in `src/app/_components/public-routes/SubstanceTripReportsSection.tsx`. Effect names printed beside replications (showcase chips and captions, the permalink's "Represents" line, the `/api/replications/showcase?locale=` long tail) go through `getLocalizedEffectNames`, which reads the effect record's own `name` segment so the chip always matches the localized article. |
| Store | `lib/postgres/schema.runtime.ts` owns segments, jobs, rejections and reviewed glossary tables; inspect migrations before releasing a schema-dependent reader. |
| Triggers and worker | Publication delivery and `src/app/api/cron/translation-refresh/route.ts` own durable jobs; inspect their current implementations and `vercel.json` rather than assuming a cached schedule or retry count. |
| UI chrome | `src/i18n/` (`t`, `msg`, `useT`) resolving `content/i18n/messages/zh-Hans.json`, built by `scripts/translation/ui-catalog.ts` from every `t()`/`msg()` literal plus copy blocks, About sections, index labels, changelog field labels, and the glossary. Missing key renders English |
| Article notice | `src/features/article/components/MachineTranslationNotice.tsx` (props `locale`, `englishUrl`) renders the contextual message `article.machineTranslationNotice` from that locale's catalog. Until a compile carries the key, the server renders the locale's entry in `src/i18n/uiMessageSeeds.ts`; a locale with neither renders the English definition, never another translation. Translated copy must keep the `[label]({{englishUrl}})` link or the notice falls back to English. The optional `review` prop (page review state from `lib/translation/pageReview.ts`, computed by `localizeRecord` and carried by `loadSubstanceRoute`) swaps in `article.humanReviewedNotice` when every paragraph has a current approval, or appends `article.paragraphsReviewed` when some do |
| Global chrome | `src/i18n/client.tsx` derives the locale from the matched `/zh` route tree during SSR and from `zh.dose.wiki` in the browser. The host fallback keeps the sticky header and footer Chinese even if a client transition temporarily exposes an English route tree before middleware rewrites the next document request |
| Page titles | `lib/next/publicSite.ts` `composePageTitle` translates the page name through the request locale (`src/i18n/requestLocale.ts`) |

A segment that fails a blocking check in `scripts/translation/validate.mjs` is not
stored: English remains visible and the rejection stays explicit. That validator
owns numeric, citation-marker, markup, script, placeholder and punctuation rules. Rejection is
not successful translation coverage; use the current worker's bounded retry contract.
Two output checks target Chinese copy:

- `REPEATED_PUNCTUATION` **blocks**. It fires on two or more adjacent full-width
  marks from `，。、；：！？` (such as `，，`) unless the source carries the same
  repetition (`?!` rendered `？！`). The unit retries with a note and, if it
  still fails, keeps its English. Existing stored or catalog text is not
  rewritten: an online `ui-catalog.ts` compile stops on a catalog entry that
  fails it (the current 2-benzylpiperidine entry does) until a retranslation
  replaces it.
- `LEFTOVER_LATIN` is a **non-blocking** review finding for zh-Hans. It lists
  English words of four or more letters left in output that has Chinese in it
  (`details.leftoverLatin`). It skips protected syntax (citation markers,
  placeholders, link targets, URLs, email addresses, file paths, code spans,
  HTML tags, identifiers with a digit or an inner dot), parenthetical glosses
  (prompt rule 11), approved glossary renderings kept in Latin (matched with
  the shared term matcher, so `Phenidate -> Phenidate` covers "phenidates"),
  names the locale rules keep in Latin (`isLatinName` in `locales.mjs`:
  acronyms, inner capitals, and capitalized words the source also
  capitalizes), and caller-supplied `latinNames` such as substance slugs.
  `findLeftoverLatin` and `findRepeatedPunctuation` are exported for
  review surfaces that scan stored targets.

The QA packet (`repeatedPunctuation`, `nonBlockingNotes.leftoverLatin`), the
coverage report (per record kind and page, over stored targets), and
`glossary-audit.mjs` (PUNCTUATION and ENGLISH sections) count both codes.
A provider failure is not a rejection. An authorization, credit or unknown-model
refusal, or a retryable failure that outlasts the engine's transport retries,
throws `TranslationTransportError` (defect code `TRANSPORT_FAILURE`) out of
`translateBatchWithRetries()`. The job fails and retries under its backoff, no
rejection row is written, and the worker log carries the code and status.

### Durable refresh and rollout

`lib/translation/segmentStore.ts` owns enqueue and lease completion. `requested_at`
is a monotonic bigint generation, not just a wall-clock timestamp: re-enqueue uses
`GREATEST(now, previous + 1)`. A claim binds generation, `claimed_at` and attempt;
completion and failure compare all three under a row lock and reject stale workers.

A failed job sets `next_attempt_at` (migration `0023`) and is not claimed again
before it: the delay starts at 150 seconds, doubles per failure up to one hour,
and gains up to 20% jitter, so the five attempts span more than 30 minutes and a
short provider outage cannot exhaust a record. A run budget abort after the
record stored segments gives back its attempt and stays due. Re-enqueueing a
record clears the delay. Once a bulk run settles, an admin can press "Retry
failed pages" on the Glossary tab's progress card: the run's exhausted jobs get
fresh attempts in the same run, and nothing else in the queue changes.

Before signed publication dispatch, the publication-delivery cron atomically
enqueues locale work and records a receipt for that publication generation.
Replay preserves that receipt instead of resetting newer work; enqueue failure
leaves delivery pending. Cache-only refresh does not enqueue new translation work.
See [the publication boundary](../architecture/runtime-and-data.md#editor-save-article-flow).

The five-minute translation-refresh cron remains the one-record incremental lane
for editorial freshness. Operator-started main translations and glossary
retranslations receive a stable `run_id` and `mode=bulk`; the separate
translation-bulk cron claims up to 100 of those records every minute. Each lane
holds its own database lease (`glm-5.3-flash:bulk`, `glm-5.3-flash:incremental`),
so invocations of one lane never overlap and editorial refreshes keep running
while a bulk campaign holds the bulk lease. The 100-request GLM 5.3 Flash
ceiling is split by `TRANSLATION_REQUEST_QUOTA` in
`lib/translation/requestPool.ts`: 90 for bulk, 8 for incremental (the refresh
cron's own concurrency), and 2 for the admin-started fluency review, including
retries, so the cap holds across the lanes and processes. Workers from before
the split used one shared lease key; drain them before rollout so old and new
leases never run side by side.
Both workers propagate
cancellation through `lib/translation/liveTranslation.ts` and
`scripts/translation/engine.mjs` to the provider request.

Each bulk run shares one wave (`lib/translation/translationWave.ts`) and one
segment writer. Its jobs queue accepted segments, and the writer commits them
one transaction at a time, coalescing whatever queued meanwhile, so a wave
holds one pool connection and the global publication-index lock at most once
at a time. A segment hash that two jobs in the wave need, for the same locale
and prompt version, is requested once; the other job waits for that result. A
job loaded after a glossary approval carries a new prompt version, so it
requests the segment itself rather than waiting on a translation made under
the older prompt. The incremental lane still writes each record's segments
itself.

Every worker invocation writes one `translationWorkerRuns` row (migration
`0022`): lane, whether it held the lease, claimed, completed, failed and
exhausted counts, token usage, duration and the first error. A run that lost
the lease records `lease_held = false` instead of looking idle. Each lane prunes
its own rows older than 14 days. `readLatestTranslationWorkerRuns()` returns the
newest row per lane; the read-only SQL is
`SELECT DISTINCT ON ("mode") * FROM "translationWorkerRuns" ORDER BY "mode", "started_at" DESC`.
`cache_pending` counts completed records whose public delivery was handed to the
publication outbox. Job failures log `[translation-worker] job:failed` and a
failed local cache expiry logs `[translation-worker] cache:local-failed`, each
with locale, slug, mode and message.
Provider failures are `OpenRouterChatError` instances carrying `status` and
`retryable`.

Accepted segments complete their record job without waiting for public
delivery. The completion transaction enqueues the record's public surfaces into
the publication outbox (`lib/next/publicationOutbox.ts`), the same queue
editorial writes use, and `/api/cron/publication-delivery` dispatches them under
the outbox's one attempt cap, lease, backoff and dead letter. The row already
carries its `translation-queue` receipt, so delivery never asks for the
translation it came from; it lands on a pending editorial row without one only
when that commit's locale work is still owed. Public delivery never consumes a
model attempt. The worker itself only expires the editor deployment's caches.
The `translationCacheJobs` table (migrations `0019`, `0024`) is retired: nothing
reads or writes it. Before rollout, drain it with the old worker or note its
remaining rows; after rollout they are inert, and a record they named reaches
the Public Hosts on its next completion or editorial write. A segment that remains
rejected after the engine's bounded retries stays English and is recorded, while
the record completes with terminal rejection detail instead of becoming an
unclaimable pending job. The Glossary tab polls the newest enqueue generation
and separates active, completed, completed-with-rejections and legacy exhausted
counts.

Migrations `0017` through `0019` add run identity and terminal status, lane-safe
job keys, the shared worker lease, and the since-retired translation-cache jobs. Apply all
three in order before releasing either worker or the progress reader. Drain old
requests, cron workers and operator binaries
before rollout: an old worker can complete unconditionally and defeat the new
lease check. Preserve job/outbox history; repair of already-missed work requires
its own bounded approved plan.

## Finding what is still English

Two read-only lenses in `scripts/translation/mirror-coverage.ts` write JSON
reports and exit 1 when coverage is missing. Neither lens authorizes a write.

```bash
# Store lens. Use an explicit isolated or separately authorized read target.
DATA_BACKEND=postgres DATA_WRITES_FROZEN=1 bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/mirror-coverage.ts store --target "$TARGET_POSTGRES_URL"
DATA_BACKEND=postgres DATA_WRITES_FROZEN=1 bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/mirror-coverage.ts store --target "$TARGET_POSTGRES_URL" --kind report --verbose
# Render lens against the mirror host.
bun scripts/translation/mirror-coverage.ts render --paths /,/substances,/reports,/replications,/2c-b --verbose
bun scripts/translation/mirror-coverage.ts render --base http://localhost:3100 --paths /reports
```

The store lens finds segments that were never translated or were rejected
(with defect codes). The render lens finds what the store cannot see: chrome
that bypasses `t()`, pages with no mirror route, record fields the corpus
excludes, translations stored but not incorporated by some loader, and stale
ISR pages. A Latin line that is itself a catalog key with a differing
translation is reported as `[catalog]`: the translation exists and a component
rendered the key raw, which is a code bug however short the line (this is how
the raw class labels on effect-page substance panels were caught). Other
lines of one to three words with no sentence punctuation are reported
separately as name-like; they are mostly substance, artist, and sponsor names
and are expected. Run the render lens after every deploy and the store lens
after every bulk write.

Labels that arrive as data (index category and class names, section titles,
stored roles, reagent descriptions) are translated inside the shared component
that renders them, never by the caller: `CategoryGrid` translates group and
section names for every page that mounts it. A caller-side `t()` map covers
one route and leaves the next one English.

## Compact publication indexes

The Chinese articles index reads `localizedPublicationIndexes`, joined to
canonical publication identity, order and visibility. It does not fetch narrative
bodies. The projection uses the same stored hash overlay and VCode reconciliation
as article details, including English fallback for missing translations.

Migrations `0012` and `0013` add the projection, producer state and invalidation
triggers. Publication writes and `writeTranslations` rebuild affected metadata
inside their transaction: a publication write rebuilds only that publication's
rows, and a segment write rebuilds only the rows whose dependency hashes include
a written segment. Only the backfill command rebuilds the whole dirty backlog.
Missing or dirty metadata is an explicit readiness error, not permission to hide
an article or load full bodies in an index read.

`bun run translate:publication-index -- --dry-run` prepares the bounded
`zh-Hans` non-blog backfill with the explicit target and remote guards from the
credentials runbook. Applying it additionally requires the reviewed plan digest,
admin identity, scoped token, private recovery journal and separately approved
operator-write classification. The command is not production-allowlisted merely
because its guards exist.

Before enabling the compact reader, replace and drain old publication and
translation producers, then complete a final backfill/readiness check. Direct
SQL/import writes leave dirty metadata and require the approved backfill.
Rollback must restore old public readers before restoring old producers.

### Localized publication-index cutover

Migrations `0012_localized_publication_indexes` and
`0013_localized_publication_index_triggers` introduce a producer/read-model
dependency. Review their generated SQL and the
`translate:publication-index` dry-run before any production mutation.

1. Rehearse migrations, projection parity and concurrent publication locally.
2. Apply only the approved additive migrations through `postgres:migrate`.
   Confirm runtime ownership/privileges and the exact backfill classification.
3. Replace the editor publication/translation producers before switching public
   readers. Drain old requests and cron workers, and keep old operator binaries
   stopped through cutover.
4. Complete the reviewed backfill and confirm every published article has clean
   metadata. Do not infer readiness from a previously cached index document.
5. Build and inspect the production-target public artifacts, including the
   Chinese index and the real Worker-rendition withdrawal canary, before aliasing.

If rollback is required, restore public reader aliases before old producer
aliases. Under the same writer barrier, disable only this feature's four
invalidation/locking triggers before old producers resume; otherwise they can
strand dirty metadata or recreate the old lock-order inversion. Retain the
projection tables and recovery journal. Trigger deactivation is a separately
reviewed, non-destructive rollback action, not a general safety bypass.

The 2026-09-14 withdrawal-cache rollback retained migrations 0012 and 0013
and the nine metadata rows while temporarily disabling the four feature
triggers. `WITHDRAWAL-REPAIR-1` subsequently applied generated migration
`0014_restore_localized_publication_index_triggers` and refreshed all nine rows
under the frozen editor barrier. Its producer is
`scripts/postgres/localizedPublicationIndexTriggers.ts` with `--restore`.
Future restoration episodes require a new generated, versioned migration;
never rewrite applied SQL or rerun 0013. The same four-trigger disable remains
the non-destructive rollback, with tables, migration history, and recovery
records retained. Media release gates are documented in
[replication media delivery](replication-media-delivery.md).

## Operator script

`scripts/translation/live-mirror.ts` uses the deployed flat
`translationSegments` hash overlay and the Postgres write ceremony in
[data-credentials.md](data-credentials.md). Read-only inspection still
requires an explicit target:

```bash
DATA_BACKEND=postgres DATA_WRITES_FROZEN=1 bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts status --target "$TARGET_POSTGRES_URL"
```

Add `--allow-remote` only for a separately authorized non-local target.
Every command reports only by default, and `status` never writes. A write
by `import`, `backfill`, `enqueue`, `run`, or `stale` repeats the reviewed
report under `DATA_BACKEND=postgres` with `--write`,
`--confirm-write=live-mirror-<command>` (for example
`--confirm-write=live-mirror-enqueue`), and
`--expected-deployment=<host/database>`. The script refuses before connecting
when any of these is missing or wrong, or while `DATA_WRITES_FROZEN` is set.
`--write` alone is not authorization: the owner approves each production
write as described in the credentials runbook.

`bun run translate:glosses` seeds `translationGlossaryTerms` from
`data/i18n/glossary/glosses/*.json`. It reports the pending glosses by
default. A write adds `--write --confirm-write=load-glosses
--expected-deployment=<host/database>` under the same ceremony, and `--force`
also overwrites glosses that already exist.

`stale --term` prints the rows it selects (`Matched rows  29 mentioning
"Entactogen"` on 2026-09-12), marks them stale and replays the marked rows. It does not restamp unrelated old digests without evidence of unchanged prompt dependencies. The `/dev/glossary` workbench's **Retranslate** (in the admin Runs drawer in Articles) does
the same marking and then enqueues the records that mention the term for the
cron, which retranslates missing and stale hashes alike. The action records a
request, not completion. Source coverage and queue state are reported separately.

The semantic source-unit, concept-registry, artifact-generation, checkpoint,
and semantic-store migration/import commands are deferred. Production has no
compatible semantic schema or reviewed-data importer, so these are not
operator commands in this release.

The legacy `translate:glossary` command's production drafting branch is closed.
`scripts/translation/build-glossary.mjs` does not expose the central target,
confirmation and write controls. Do not invent unsupported flags or treat
`DATA_BACKEND=postgres` as authorization. Reopening requires reviewed source,
guard and production-allowlist ownership. Its count/export modes are read-only
descriptions, not automatically authorized remote reads: verify their client and
target behavior first. Local model artifacts may be prepared for the separate
guarded importer below; approved editor review remains a distinct role-gated path.

### Importing generated glossary drafts

`translate:glossary:import-drafts` imports explicitly selected local model artifacts
into the editor review queue. Inspect the locale registry and artifact set for
supported locales. It does not activate public mirrors, approve terms, or enqueue translation jobs. Every
existing row, including an existing draft, is preserved.

```bash
DATA_BACKEND=postgres DATA_WRITES_FROZEN=1 \
  bun run translate:glossary:import-drafts -- \
  --locales <approved-comma-separated-locales> \
  --dry-run --allow-remote
```

Select locales from the source registry and the exact approved artifact plan.
Set `TARGET_POSTGRES_URL` explicitly and `POSTGRES_IMPORT_CONFIRM` to its host
as described in the credentials runbook. The plan reports file hashes,
existing-row and missing-key digests, counts, and `planDigest`. After owner
approval, the write invocation replaces `--dry-run` with `--write` and adds
`--confirm-write=import-glossary-drafts`, `--expected-deployment=<host/database>`,
`--confirm-plan=<planDigest>`, `--actor-email=<registered-admin>`, and
`--recovery-out=<new-file.jsonl>`. It requires the scoped
`DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE` credential and an open write gate;
there is no legacy-token fallback. Do not reopen a production freeze without
separate authorization.

The importer validates all inputs before a single insert-only transaction.
Rows retain `status=draft`, `source=model`, and empty review metadata. A
changed plan or concurrent insert aborts the transaction. The private recovery
journal records exact inserted postimages; separately approved rollback must
match those postimages so subsequent human reviews are never removed. Verify
stored rows against the journal and rerun the dry-run after importing.
Deploy the expanded locale registry to the editor before opening newly
supported languages there; the JSON files alone are not runtime data.

For a new kind, corpus change or validator fix, inspect `live-mirror.ts` for the
appropriate bounded backfill versus per-record enqueue path. Operator/import
writes may bypass application enqueueing; their separately approved plan must
include locale coverage reconciliation. Do not infer completion from old counts
or durations.

After a UI string change, inspect `scripts/translation/ui-catalog.ts` and its
package command. Review generated catalog changes through the producer-owned
workflow; remote reads and provider/model calls retain their own authorization.

## Deployment requirements

- `dosewiki-admin` carries `OPENROUTER_API_KEY`, `CRON_SECRET`, and
  `DATA_BACKEND=postgres`. Put a spend cap on the key. The public and Effect
  Index projects never carry the key.
- Vercel invokes crons on the deployment URL, not a custom domain. The admin
  project's Deployment Protection is therefore `preview` only (production
  deployment URLs open; the app's own session gate still applies), and
  `src/middleware.ts` lets the two cron GETs through the host gate. With
  protection on `all_except_custom_domains` every cron on the project silently
  never ran (2026-01 to 2026-09-11).
- Production builds must run with `DATA_BACKEND=postgres`, or the prerendered
  mirror pages ship with English titles; a local `bun run build` needs it
  too before a mirror smoke.
- The mirror calls the shared `getStaticSubstanceParams` loader in
  `lib/next/staticParams.ts` with its locale, and `lib/next/prerenderPolicy.ts`
  answers with an empty tier list: no mirror substance article is prerendered.
  Each renders on its first request with the translation overlay and is held
  by the hourly ISR cache, so the required post-deploy warm in
  [deployment](deployment.md#build-and-release-sequence) is what puts the
  mirror in front of a reader warm. Route files under `src/app/zh/` own other
  static/dynamic choices. During an authorized build, verify the actual output
  with `bun run build:census` rather than copying a page count. Mirror pages
  use a locale constant, never request APIs that make static paths dynamic.
- When warming after an authorized release, inspect the `mirror:warm` package
  command for current bounds, path filters and target options. Verify canonical
  responses and run both coverage lenses; elapsed time and a historical warm
  duration do not establish rendered coverage.
- `zh.dose.wiki` is a domain on the public project (DNS CNAME like `www`) and
  is listed in `lib/next/publicHostPolicy.ts`.

## Known gaps

- The mirror chrome is only as current as the committed catalog; a Copy Studio
  or About edit reaches the mirror in English until the catalog is rebuilt and
  deployed.
- Clip titles and descriptions translate; the credit line, artist name, and
  rights fields stay as written (attribution). Citation titles, reagent colour
  chains, open-data samples, and the JSON preview on About are English by design.
- The pipeline's supported locales are owned by `scripts/translation/locales.mjs`;
  public activation is owned separately by `lib/next/localeHostPolicy.ts`. Inspect
  operator and coverage implementations for locale restrictions before expansion.
- Russian uses the same stored overlays and English fallback as Chinese.
  `live-mirror.ts`, `mirror-coverage.ts`, `ui-catalog.ts`, and
  `backfill-publication-index.ts` accept `--locale`; their default remains
  `zh-Hans`. Domain readiness is separate from completed translation jobs.

## Adding a locale

Run the coverage audits and review any remaining fallback before launch. Then:

1. Add the locale to `LOCALES` in `scripts/translation/locales.mjs` with its script
   gate, length band and register notes. Prepare glossary drafts only through an
   authorized editor path or reviewed local artifacts and the guarded importer.
   The legacy production drafting CLI remains closed. Review every term in
   `/dev/glossary` until no drafts remain; preserve collision and language-scope gates.
2. Add the host to `LIVE_LOCALES` in `lib/next/localeHostPolicy.ts` (its
   `code` union), `PUBLIC_HOSTS`, `ROOT_ROUTE_SEGMENTS` in
   `lib/next/publicRouteAvailability.ts`, and mirror every route under
   `src/app/zh/**` under the new prefix. Name the locale in the policy table
   in `lib/next/prerenderPolicy.ts` (typecheck fails until you do); the
   expected answer is on demand, so the new mirror adds no pages to the build.
   Add the new host to the post-deploy warm command in the deployment runbook.
3. Add the locale to `UI_LOCALES` and `CATALOGS` in `src/i18n/messages.ts`,
   generalize the locale constant in `live-mirror.ts`, `mirror-coverage.ts`,
   and `ui-catalog.ts`, then build its catalog.
4. Add the domain on Vercel, then either "Start main translation" in the workbench's Runs drawer in Articles
   (enqueues every record for the cron, slow but hands-free) or run
   `backfill` from a workstation, and run both coverage lenses.

### Russian launch prerequisites

The Russian route tree is `src/app/ru/`, with host `ru.dose.wiki` on the public
project. Its UI catalog is `content/i18n/messages/ru.json`; the client loads only the
active language catalog. Gallery API requests and cursor identities retain `ru`.

Before promotion, run the guarded publication-index dry run with `--locale ru`.
Apply the reviewed plan through the existing command and credential ceremony,
then confirm `readLocalizedPublicationIndex` succeeds. Do not bypass its readiness
error or replace the compact index with full narrative reads. Inspect failed
translation jobs separately; a completed glossary does not establish corpus
coverage. Build and verify host rewrites, Russian reading pages, Chinese About,
and the public artifact audit before adding the new production domain. Release
the matching locale registry to the editor as well so subsequent publications
enqueue Russian translation jobs and expire Russian cache paths.
