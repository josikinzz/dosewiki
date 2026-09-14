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
  system prompt and shared rules in `scripts/translation/locales.mjs`. The
  batch CLI, the cron, the operator script, and the UI catalog builder all go
  through `scripts/translation/engine.mjs`, which receives the glossary as an
  argument from its caller, so they cannot drift apart. `prompt_version`
  (digest of model, prompt, and the approved glossary) is stamped on every
  row; a prompt change is followed by `live-mirror.ts stale --write`, a
  glossary edit by the scoped form below or the tab's retranslate action.
- **Canonical terms.** The glossary lives in Postgres
  (`translationGlossary`, migration `0008`; `lib/translation/glossary.ts`):
  one row per locale and term with `target`, `kind`, `status` (`draft` |
  `approved`), `source` (`model` | `human`), and who reviewed it. Only
  approved rows reach a prompt or the digest. It is reviewed in
  `/dev/glossary` (admin): draft the missing terms by machine, approve or
  edit each gloss (editing approves), then "Start main translation" for a
  locale with no drafts left, or "Retranslate affected segments" after an
  edit. zh-Hans holds 395 approved terms (effect names, categories, chemical
  and psychoactive classes, enum labels, the harm-reduction register); they
  are injected into every prompt that mentions them and post-checked as
  `GLOSSARY_MISS` (reported, not blocking). `scripts/translation/glossary/
  <locale>.json` is an export of the table (`npm run translate:glossary --
  --locale zh-Hans --export`) for diffing; nothing reads it. Substance names,
  receptors, statutes, and brands stay in Latin script by prompt rule 2, so
  short Latin lines on a mirror page are expected.

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
| Pages | `src/app/zh/**`: homepage, `/substances`, `/substances/group/[groupSlug]` (the psychoactive class views), `/category/[categoryKey]`, `/[slug]`, `/effects(/[slug])`, `/effects/group/[groupSlug]` (the five index tabs), `/effects/category/[categorySlug]`, `/reports(/[slug])`, `/articles(/[slug])`, `/chemical-classes(/[classKey])`, `/contributors/[profileKey]`, `/changes`, `/replications` (+ tabs, `/[slug]`, `/viewer/[slug]`, `/artist/[key]`), `/psychoactive/[...summaryPath]` (the class summaries, with the localized effect records spliced into each summary), `/search` (query string preserved), `/about`, `/glossary`, and localized not-found chrome |
| Record kinds | `lib/translation/liveTranslation.ts` `TranslationRecordKind`: `article` (substances), `effect`, `report`, `library` (long-form archive), `replication` (gallery titles), `profile` (contributor bios). Job slugs carry the kind as a prefix except substances |
| Corpora | `scripts/translation/corpora.mjs` per kind, plus the bio-only profile projection in `lib/translation/liveTranslation.ts`: which keys translate and which are the record (numbers, names, URLs, IDs). Reports translate the narrative plus the free-text `dose`, `roa`, and `time` lines authors write |
| Reads | `lib/translation/localizedRecords.ts` (cached `getLocalizedPublic*`), consumed by `lib/next/routeLoaders.*`; contributor localization projects each profile to `{slug, bio}` so names, roles, links, and identity fields stay canonical. The substance page's related-report rail localizes in `src/app/_components/public-routes/SubstanceTripReportsSection.tsx`. Effect names printed beside replications (showcase chips and captions, the permalink's "Represents" line, the `/api/replications/showcase?locale=` long tail) go through `getLocalizedEffectNames`, which reads the effect record's own `name` segment so the chip always matches the localized article. |
| Store | Postgres `translationSegments`, `translationJobs` (outbox per record, lease, 5 attempts), `translationRejections` (units the model failed, with defect codes), `translationGlossary` (reviewed terms per locale, edited in `/dev/glossary` through `src/app/api/dev/translation-glossary/*`) in `lib/postgres/schema.runtime.ts`; migrations `0006`, `0007`, `0008` |
| Triggers | `src/app/api/save-to-convex/revalidateSavedPaths.ts` (substance, effect, report, library, replication targets), `src/app/api/dev/writing-article/route.ts`, `src/app/api/dev/replications/publishReplicationRecord.ts`, and contributor profile publication through `src/app/api/dev/contributor-profile/contributorRevalidation.ts` |
| Worker | `GET /api/cron/translation-refresh` on `dosewiki-admin` every five minutes behind `CRON_SECRET`: claims due jobs, translates the hashes the store lacks, records rejections, expires the record's public and mirror caches |
| UI chrome | `src/i18n/` (`t`, `msg`, `useT`) resolving `src/i18n/messages/zh-Hans.json`, built by `scripts/translation/ui-catalog.ts` from every `t()`/`msg()` literal plus copy blocks, About sections, index labels, changelog field labels, and the glossary. Missing key renders English |
| Global chrome | `src/i18n/client.tsx` derives the locale from the matched `/zh` route tree during SSR and from `zh.dose.wiki` in the browser. The host fallback keeps the sticky header and footer Chinese even if a client transition temporarily exposes an English route tree before middleware rewrites the next document request |
| Page titles | `lib/next/publicSite.ts` `composePageTitle` translates the page name through the request locale (`src/i18n/requestLocale.ts`) |

A segment that fails a blocking check (`scripts/translation/validate.mjs`:
changed numbers, dropped citation markers, lost markup or placeholders,
Traditional characters, untranslated, empty) is not stored; its English keeps
rendering, the failure lands in `translationRejections`, and the next refresh
or backfill retries it. The number gate accepts Chinese numerals to 99, 百 for
100, 两 for 2, myriad forms (万, 亿), clock times, zero-padded and dotted dates.

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

## Operator script

`scripts/translation/live-mirror.ts` uses the deployed flat
`translationSegments` hash overlay and the Postgres write ceremony in
[convex-credentials.md](convex-credentials.md). Read-only inspection still
requires an explicit target:

```bash
DATA_BACKEND=postgres DATA_WRITES_FROZEN=1 bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/live-mirror.ts status --target "$TARGET_POSTGRES_URL"
```

Add `--allow-remote` only for a separately authorized non-local target.
Write-capable commands (`import`, `backfill`, `enqueue`, `run`, and `stale`)
require the complete intent-scoped credential, explicit target, role, freeze,
review, confirmation phrase, and `--write` ceremony documented in the
credentials runbook. `--write` alone is not authorization.

`stale --term` prints the rows it selects (`Matched rows  29 mentioning
"Entactogen"` on 2026-09-12), marks them stale, restamps every other row on an
older digest with the current one (a segment that does not mention the term
receives a byte-identical prompt, so the restamp is exact), and replays the
marked rows. The `/dev/glossary` tab's "Retranslate affected segments" does
the same marking and then enqueues the records that mention the term for the
cron, which retranslates missing and stale hashes alike.

The semantic source-unit, concept-registry, artifact-generation, checkpoint,
and semantic-store migration/import commands are deferred. Production has no
compatible semantic schema or reviewed-data importer, so these are not
operator commands in this release.

Glossary drafting and export (reads through Postgres; drafting also needs
`OPENROUTER_API_KEY`):

```bash
export DATA_BACKEND=postgres
npm run translate:glossary -- --locale nl --dry-run     # count the terms the locale lacks
npm run translate:glossary -- --locale nl               # draft them as `draft` rows (or the tab's "Draft missing terms")
npm run translate:glossary -- --locale zh-Hans --export # snapshot the table to scripts/translation/glossary/zh-Hans.json
npm run translate:audit -- --all --glossary             # corpus audit scoped to the approved glossary, plus DISAGREE
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
  mirror pages ship with English titles; a local `npm run build` needs it
  too before a mirror smoke.
- The mirror prerenders the same tiers as English, because the ISR page cache
  does not survive a deploy: `src/app/zh/[slug]` the high and normal priority
  substances (`getStaticSubstanceParams`, about 266), `src/app/zh/reports/[slug]`
  every published report (`getStaticReportParams`, about 166), and the index
  pages (`/zh`, `/zh/substances` and its `/zh/substances/group/*` class views,
  `/zh/effects` and its five `/zh/effects/group/*` tabs, `/zh/reports`,
  `/zh/articles`, `/zh/chemical-classes`, the `/zh/replications` tabs,
  `/zh/about`, `/zh/glossary`) as static routes. Effects, library articles,
  substance and effect category details, chemical class details, contributor
  profiles, psychoactive summaries, replication permalinks, viewer deep links,
  and artist pages return `[]` like their English routes and render on first
  request; `/zh/search` is dynamic like `/search`. A mirror page reads its
  `LOCALE` constant, never from the request, so a prerendered path never reaches
  `headers()`.
- After a deploy, warm the long tail: `npm run mirror:warm -- --skip=/replications/`
  walks the English sitemap and requests every non-gallery path (about 900) on
  `zh.dose.wiki` with no database access, printing status counts, edge cache
  hits, and p50/p95 latency; a cold pass takes under two minutes. Without
  `--skip` it also warms the 8,700 gallery permalinks and artist pages, about
  an hour cold. `--paths=/,/substances,/2c-b` warms a list instead, `--limit=<n>`
  bounds a run, and `--base=http://localhost:3100` points it at a local
  `next start` with `Host: zh.dose.wiki`. The build measured on 2026-09-12:
  1,047 static pages in 7.2 min against 616 in 6.0 min before the mirror
  tiers, 9.1 min wall.
- `zh.dose.wiki` is a domain on the public project (DNS CNAME like `www`) and
  is listed in `lib/next/publicHostPolicy.ts`.

## Known gaps

- The mirror chrome is only as current as the committed catalog; a Copy Studio
  or About edit reaches the mirror in English until the catalog is rebuilt and
  deployed.
- Clip titles and descriptions translate; the credit line, artist name, and
  rights fields stay as written (attribution). Citation titles, reagent colour
  chains, open-data samples, and the JSON preview on About are English by design.
- `nl` exists in `locales.mjs` without a host; `live-mirror.ts` and
  `mirror-coverage.ts` hardcode `zh-Hans`.

## Adding a locale

Not before the zh coverage audit runs clean. Then:

1. Add the locale to `LOCALES` in `scripts/translation/locales.mjs` (script
   gate, length band, register notes). Draft its glossary with `npm run
   translate:glossary -- --locale <code>` or the Glossary tab's "Draft missing
   terms", then review every draft in `/dev/glossary` (approve as it stands or
   type the rendering) until the locale shows zero drafts.
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
