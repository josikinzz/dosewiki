# Locale mirrors (zh.dose.wiki)

Unlisted, machine-translated mirrors of dose.wiki for readers who share the
language. One subdomain per locale; Simplified Chinese is the first and, until
its coverage audit runs clean, the only one.

## What it is and is not

- **Not a parallel database.** There is no Chinese copy of any record. The
  store is an overlay: `translationSegments(locale, hash, source, target,
  model, prompt_version)` keyed by a content hash of each English leaf. A page
  render segments the live English record exactly as the batch pipeline does,
  looks up the hashes, and splices the stored targets over a clone. A hash the
  store lacks renders in English. Identical English anywhere in the corpus is
  one row.
- **English is the only baseline.** Nothing edits Chinese directly. An English
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
  `/dev/glossary` by admins or Translators assigned that language: approve or
  edit each rendering (editing approves). Editor and Translator are independent
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

The `gt` and `gt-next` package dependencies plus tracked `gt.config.json` are
intentionally deferred. The current locale mirrors do not import them or use GT
at runtime. Keep them until their intended integration or retirement and
source/provenance requirements are resolved. Their presence does not mean GT
serves production.

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
| Global chrome | `src/i18n/client.tsx` derives the locale from the matched `/zh` route tree during SSR and from `zh.dose.wiki` in the browser. The host fallback keeps the sticky header and footer Chinese even if a client transition temporarily exposes an English route tree before middleware rewrites the next document request |
| Page titles | `lib/next/publicSite.ts` `composePageTitle` translates the page name through the request locale (`src/i18n/requestLocale.ts`) |

A segment that fails a blocking check in `scripts/translation/validate.mjs` is not
stored: English remains visible and the rejection stays explicit. That validator
owns numeric, citation-marker, markup, script and placeholder rules. Rejection is
not successful translation coverage; use the current worker's bounded retry contract.

### Durable refresh and rollout

`lib/translation/segmentStore.ts` owns enqueue and lease completion. `requested_at`
is a monotonic bigint generation, not just a wall-clock timestamp: re-enqueue uses
`GREATEST(now, previous + 1)`. A claim binds generation, `claimed_at` and attempt;
completion and failure compare all three under a row lock and reject stale workers.

Before signed publication dispatch, the publication-delivery cron atomically
enqueues locale work and records a receipt for that publication generation.
Replay preserves that receipt instead of resetting newer work; enqueue failure
leaves delivery pending. Cache-only refresh does not enqueue new translation work.
See [the publication boundary](../architecture/runtime-and-data.md#editor-save-article-flow).

The translation-refresh cron processes one job at a time under a shared abort
signal and an admission reserve. `src/app/api/cron/translation-refresh/route.ts`
owns those limits; `lib/translation/liveTranslation.ts` and
`scripts/translation/engine.mjs` propagate cancellation to the provider request.
Rejected segments or missing/failed cache-delivery receipts leave the job pending
under the store's bounded attempt limit, not completed or retried indefinitely.

This generation/receipt change needs no schema migration. Drain old requests,
cron workers and operator binaries before rollout: an old worker can complete
unconditionally and defeat the new lease check. Preserve job/outbox history;
repair of already-missed work requires its own bounded approved plan.

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
inside their transaction. Missing or dirty metadata is an explicit readiness
error, not permission to hide an article or load full bodies in an index read.

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
Write-capable commands (`import`, `backfill`, `enqueue`, `run`, and `stale`)
require the complete intent-scoped credential, explicit target, role, freeze,
review, confirmation phrase, and `--write` ceremony documented in the
credentials runbook. `--write` alone is not authorization.

`stale --term` selects affected rows, marks them stale and restamps unaffected
rows only when their prompt remains byte-identical. The editor's affected-segment
action enqueues corresponding records. Review the actual selection and digest
before authorizing either path; a historical row count is not scope evidence.

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
  npm run translate:glossary:import-drafts -- \
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
  mirror pages ship with English titles; a local `npm run build` needs it
  too before a mirror smoke.
- The mirror uses the shared `getStaticSubstanceParams` selector in
  `lib/next/staticParams.ts`, including public high, normal and low priorities.
  Route files under `src/app/zh/` own other static/dynamic choices. During an
  authorized build, verify the actual output rather than copying a page count.
  Mirror pages use a locale constant, never request APIs that make static paths dynamic.
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

## Adding a locale

Not before the zh coverage audit runs clean. Then:

1. Add the locale to `LOCALES` in `scripts/translation/locales.mjs` with its script
   gate, length band and register notes. Prepare glossary drafts only through an
   authorized editor path or reviewed local artifacts and the guarded importer.
   The legacy production drafting CLI remains closed. Review every term in
   `/dev/glossary` until no drafts remain; preserve collision and language-scope gates.
2. Add the host to `LIVE_LOCALES` in `lib/next/localeHostPolicy.ts` (its
   `code` union), `PUBLIC_HOSTS`, `ROOT_ROUTE_SEGMENTS` in
   `lib/next/publicRouteAvailability.ts`, and mirror every route under
   `src/app/zh/**` under the new prefix.
3. Add the locale to `UI_LOCALES` and `CATALOGS` in `src/i18n/messages.ts`,
   generalize the locale constant in `live-mirror.ts`, `mirror-coverage.ts`,
   and `ui-catalog.ts`, then build its catalog.
4. Add the domain on Vercel, then either "Start main translation" in the tab
   (enqueues every record for the cron, slow but hands-free) or run
   `backfill` from a workstation, and run both coverage lenses.
