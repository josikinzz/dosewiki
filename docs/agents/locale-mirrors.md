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
- **One model, one prompt.** `z-ai/glm-5.3-flash` via OpenRouter with the
  system prompt, shared rules, and frozen glossary in
  `scripts/translation/locales.mjs` and `scripts/translation/glossary/`. The
  batch CLI, the cron, the operator script, and the UI catalog builder all go
  through `scripts/translation/engine.mjs`, so they cannot drift apart.
  `prompt_version` (digest of model, prompt, glossary) is stamped on every row;
  a prompt or glossary change is followed by `live-mirror.ts stale --write`.
- **Canonical terms.** The frozen glossary (377 terms: effect names,
  categories, chemical and psychoactive classes, enum labels) is injected into
  every prompt and post-checked as `GLOSSARY_MISS` (reported, not blocking).
  Substance names, receptors, statutes, and brands stay in Latin script by
  prompt rule 2, so short Latin lines on a mirror page are expected.

## Shape

| Piece | Where |
| --- | --- |
| Host to locale, route prefix, localized paths | `lib/next/localeHostPolicy.ts` (`zh.dose.wiki` to `zh-Hans`, `/zh`) |
| Request routing | `src/middleware.ts`: mirror-host paths in the public corpus rewrite to `/zh/...`; paths outside it rewrite to `/zh/unroutable/missing` with a 404 status; `/zh/...` on any other host is a real 404. The root `not-found.tsx` must never read request APIs (that turned every static mirror route dynamic and crashed it) |
| Pages | `src/app/zh/**`: homepage, `/substances`, `/[slug]`, `/effects(/[slug])`, `/reports(/[slug])`, `/articles(/[slug])`, `/replications` (+ tabs, `/[slug]`, `/viewer/[slug]`, `/artist/[key]`), `/about`. Same loaders and components as the English routes with a `LiveLocale`; `noindex`, English canonical, `lang="zh-Hans"` |
| Record kinds | `lib/translation/liveTranslation.ts` `TranslationRecordKind`: `article` (substances), `effect`, `report`, `library` (long-form archive), `replication` (gallery titles). Job slugs carry the kind as a prefix except substances |
| Corpora | `scripts/translation/corpora.mjs` per kind: which keys translate and which are the record (numbers, names, urls, ids). Reports translate the narrative plus the free-text `dose`, `roa`, and `time` lines authors write |
| Reads | `lib/translation/localizedRecords.ts` (cached `getLocalizedPublic*`), consumed by `lib/next/routeLoaders.*`; the substance page's related-report rail localizes in `src/app/_components/public-routes/SubstanceTripReportsSection.tsx` |
| Store | Postgres `translationSegments`, `translationJobs` (outbox per record, lease, 5 attempts), `translationRejections` (units the model failed, with defect codes) in `lib/postgres/schema.runtime.ts`; migrations `0006`, `0007` |
| Triggers | `src/app/api/save-to-convex/revalidateSavedPaths.ts` (substance, effect, report, library, replication targets), `src/app/api/dev/writing-article/route.ts`, `src/app/api/dev/replications/publishReplicationRecord.ts` |
| Worker | `GET /api/cron/translation-refresh` on `dosewiki-admin` every five minutes behind `CRON_SECRET`: claims due jobs, translates the hashes the store lacks, records rejections, expires the record's public and mirror caches |
| UI chrome | `src/i18n/` (`t`, `msg`, `useT`) resolving `src/i18n/messages/zh-Hans.json`, built by `scripts/translation/ui-catalog.ts` from every `t()`/`msg()` literal plus copy blocks, About sections, index labels, changelog field labels, and the glossary. Missing key renders English |
| Page titles | `lib/next/publicSite.ts` `composePageTitle` translates the page name through the request locale (`src/i18n/requestLocale.ts`) |

A segment that fails a blocking check (`scripts/translation/validate.mjs`:
changed numbers, dropped citation markers, lost markup or placeholders,
Traditional characters, untranslated, empty) is not stored; its English keeps
rendering, the failure lands in `translationRejections`, and the next refresh
or backfill retries it. The number gate accepts Chinese numerals to 99, 百 for
100, 两 for 2, myriad forms (万, 亿), clock times, zero-padded and dotted dates.

## Finding what is still English

Two lenses in `scripts/translation/mirror-coverage.ts`; both write a JSON
report under `runs/translation/` and exit 1 when anything is missing.

```bash
set -a && . ./.env.local && set +a
# Store lens: every public record of every kind, segments the store lacks, why.
DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/mirror-coverage.ts store
DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/mirror-coverage.ts store --kind=report --verbose
# Render lens: fetch mirror pages, flag visible lines with no Han character.
bun scripts/translation/mirror-coverage.ts render --paths=/,/substances,/reports,/replications,/2c-b --verbose
bun scripts/translation/mirror-coverage.ts render --base=http://localhost:3100 --paths=/reports   # against a local next start
```

The store lens finds segments that were never translated or were rejected
(with defect codes). The render lens finds what the store cannot see: chrome
that bypasses `t()`, pages with no mirror route, record fields the corpus
excludes, translations stored but not incorporated by some loader, and stale
ISR pages. Lines of one to three words with no sentence punctuation are
reported separately as name-like; they are mostly substance, artist, and
sponsor names and are expected. Run the render lens after every deploy and the
store lens after every bulk write.

## Operator script

`scripts/translation/live-mirror.ts` under the Postgres write ceremony in
[convex-credentials.md](convex-credentials.md):

```bash
set -a && . ./.env.local && set +a
export DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=aws-us-east-1-2.pg.psdb.cloud
bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts status --allow-remote
bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts backfill --allow-remote --write            # every missing unit of every kind, in bulk
bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts backfill --kind=replication --allow-remote --write
bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts enqueue --kind=report --all --allow-remote --write
bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts run --limit=20 --allow-remote --write     # work the queue like the cron
bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts stale --allow-remote --write              # after a prompt or glossary change
```

`backfill` is the command for a new kind, a corpus change, or a validator fix:
it dedupes units across records and sends full batches, so the whole corpus
(34,500 units) completes in about half an hour. `enqueue` + `run` is the
per-record path the cron uses. Scripts that write published content outside
the app (`scripts/batch/**`, `scripts/convex/**`, imports) do not enqueue;
run `backfill` after them.

After a UI string change: `DATA_BACKEND=postgres bun --preload
./scripts/postgres/preload-server-only.ts scripts/translation/ui-catalog.ts
--live-copy --write`, commit the catalog, deploy.

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
  mirror index pages ship with English titles; a local `npm run build` needs it
  too before a mirror smoke.
- `zh.dose.wiki` is a domain on the public project (DNS CNAME like `www`) and
  is listed in `lib/next/publicHostPolicy.ts`.

## Known gaps

- The mirror chrome is only as current as the committed catalog; a Copy Studio
  or About edit reaches the mirror in English until the catalog is rebuilt and
  deployed.
- Effect audio-replication credits, citation titles, reagent colour chains,
  open-data samples, and the JSON preview on About are English by design.
- `nl` exists in `locales.mjs` without a host; `live-mirror.ts` and
  `mirror-coverage.ts` hardcode `zh-Hans`.

## Adding a locale

Not before the zh coverage audit runs clean. Then:

1. Add the locale to `LOCALES` in `scripts/translation/locales.mjs`, freeze
   its glossary with `npm run translate:glossary`, register the file in
   `FROZEN_GLOSSARIES`.
2. Add the host to `LIVE_LOCALES` in `lib/next/localeHostPolicy.ts` (its
   `code` union), `PUBLIC_HOSTS`, `ROOT_ROUTE_SEGMENTS` in
   `lib/next/publicRouteAvailability.ts`, and mirror every route under
   `src/app/zh/**` under the new prefix.
3. Add the locale to `UI_LOCALES` and `CATALOGS` in `src/i18n/messages.ts`,
   generalize the locale constant in `live-mirror.ts`, `mirror-coverage.ts`,
   and `ui-catalog.ts`, then build its catalog.
4. Add the domain on Vercel, run `backfill`, run both coverage lenses.
