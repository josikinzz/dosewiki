# Locale mirrors (zh.dose.wiki)

Unlisted, machine-translated mirrors of substance articles for readers who
share the language. One subdomain per locale; Simplified Chinese is the first.

## Shape

| Piece | Where |
| --- | --- |
| Host to locale, route prefix, cache paths | `lib/next/localeHostPolicy.ts` (`zh.dose.wiki` to `zh-Hans`, `/zh`) |
| Request routing | `src/middleware.ts`: `zh.dose.wiki/<slug>` rewrites to `/zh/<slug>` when the slug is in the public corpus; every other path on the mirror host serves the English page; `/zh/...` on any other host is a real 404 |
| Page | `src/app/zh/[slug]/page.tsx`: same loader and article component as `/[slug]`, `noindex`, canonical is the English article, `lang="zh-Hans"` wrapper, standing machine-translation notice |
| Record composition | `lib/translation/liveTranslation.ts` `localizeSubstanceRecord`: the batch pipeline's segmenter cuts the record, stored targets are spliced over a clone, untranslated leaves stay English |
| Store | Postgres `translationSegments` (`locale`, `hash` of the English text, `target`, `model`, `prompt_version`) and `translationJobs` (outbox per article) in `lib/postgres/schema.runtime.ts`, migration `0006_translation_segments` |
| Trigger | every article publication that passes `revalidateSavedPaths` upserts a job per locale |
| Worker | `GET /api/cron/translation-refresh` on `dosewiki-admin` every five minutes behind `CRON_SECRET`: claims due jobs, translates only the hashes the store lacks, then expires the article's public caches |
| Model and prompt | `z-ai/glm-5.3-flash` via OpenRouter with the system prompt and frozen glossary from `scripts/translation/locales.mjs`; `prompt_version` is a digest of model, prompt and glossary, stamped on every row |

Identical English sentences share one row across the corpus, so an edited
sentence is the only thing a refresh sends to the model. A segment that fails
a blocking check (`scripts/translation/validate.mjs`: changed numbers, dropped
citation markers, Traditional characters, untranslated, implausible length) is
not stored; its English keeps rendering and the next refresh retries it.

## Deployment requirements

- `dosewiki-admin` (dev.dose.wiki) carries `OPENROUTER_API_KEY` in addition to
  its existing write tier and `CRON_SECRET`. Put a spend cap on the key. The
  public and Effect Index projects never carry it.
- The public dose.wiki Vercel project has `zh.dose.wiki` as a domain (DNS CNAME
  like `www`). The host is already listed in `lib/next/publicHostPolicy.ts`.
- The production migration `0006_translation_segments` is applied with
  `npm run postgres:migrate` over `POSTGRES_DIRECT_URL` (two new empty tables,
  nothing else touched).

## Operator script

`scripts/translation/live-mirror.ts` under the Postgres write ceremony in
[convex-credentials.md](convex-credentials.md):

```bash
set -a && . ./.env.local && set +a
export DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=aws-us-east-1-2.pg.psdb.cloud
bun scripts/translation/live-mirror.ts status --allow-remote
bun scripts/translation/live-mirror.ts import --run=notes-and-plans/exports/translation/zh-Hans/substances --allow-remote --write
bun scripts/translation/live-mirror.ts enqueue --all --allow-remote --write
bun scripts/translation/live-mirror.ts run --limit=20 --allow-remote --write   # needs OPENROUTER_API_KEY; the cron does the same
bun scripts/translation/live-mirror.ts stale --allow-remote --write            # after a deliberate prompt or glossary change
```

`import` seeds the store from a finished batch run (the 2026-09-09 zh-Hans run
holds 19,557 usable segments). `enqueue --all` then lets the cron translate
whatever moved since that export. Without `--write` every command is a dry run.

## Adding a locale

1. Add the locale to `LOCALES` in `scripts/translation/locales.mjs` and freeze
   its glossary with `npm run translate:glossary`; register the freeze file in
   `FROZEN_GLOSSARIES` there.
2. Add the host entry to `LIVE_LOCALES` in `lib/next/localeHostPolicy.ts`, the
   host to `PUBLIC_HOSTS`, the prefix to `ROOT_ROUTE_SEGMENTS` in
   `lib/next/publicRouteAvailability.ts`, and a `src/app/<prefix>/[slug]`
   route mirroring `src/app/zh/[slug]`.
3. Add the domain on Vercel, then `enqueue --all` for the new locale.
