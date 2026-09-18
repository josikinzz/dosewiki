# content/

Authored prose and prompt text that the application, its seed scripts, and its
translation tooling load. Nothing here is generated; edit the files by hand.
Structured datasets live in `data/` instead.

Application code reaches these files through the `@content/*` alias
(`tsconfig.json`, `vitest.config.ts`, `scripts/config/vitest.scripts.config.ts`). Plain `.mjs`
scripts use relative paths. Markdown is imported with `?raw`; JSON is imported
directly.

## About page

| File | Loaded by |
| --- | --- |
| `about/about.md` | `src/data/content/about.ts` (seed shown until the Postgres About document exists); `scripts/seed/seed-site-config.mjs`; `scripts/translation/ui-catalog.ts`. Section headings are split by `src/data/content/aboutSections.ts`; `{{compoundCount}}`, `{{effectCount}}`, `{{replicationCount}}`, `{{reportCount}}` are filled by `applyPlaceholders` |
| `about/subtitle.md` | `src/data/content/about.ts`; `scripts/seed/seed-site-config.mjs`; `scripts/translation/ui-catalog.ts` |
| `about/config.json` | `src/data/content/about.ts` (`founderProfileKeys`); `scripts/seed/seed-site-config.mjs` |
| `about/community.json` | `src/data/content/aboutCommunity.ts` (Partners & Community roster; artwork under `public/about/community/`) |
| `about/effect-index-mission.md` | `src/config/siteFlavor.ts` (Effect Index flavor About prose; dose.wiki's About prose is editor-managed in Postgres) |

## Copy blocks

| File | Loaded by |
| --- | --- |
| `copy-blocks/copyBlocks.json` | `src/data/content/copyBlocks.ts` (fallback defaults and Copy Studio reset target); `scripts/seed/seed-copy-blocks.mjs`; `scripts/translation/ui-catalog.ts`; `scripts/translation/corpora.mjs` |

## Prompts

| File | Loaded by |
| --- | --- |
| `prompts/registry.json` | `src/data/config/promptRegistry.ts`; `scripts/lib/prompt-registry.mjs`. Each entry's `seedPath` names a file below |
| `prompts/generator.md` | `scripts/lib/prompt-drift-policy.mjs` via the registry (`prompts:compare`, `prompts:migrate`) |
| `prompts/sections/*.md` | Registry seeds for the article section prompts; `src/schema/substance/sectionCatalog.ts` `seedPath`; `src/app/docs/how/page.tsx` (published on /docs/how); `scripts/batch/{dosage-duration,tolerance}/cli.mjs` `promptFallbackFile`; `scripts/migrate/migrate-binding-sites.mjs` |
| `prompts/formal-citations/*.md` | Registry seeds for the formal citation prompts |
| `prompts/extraction/*.md` | `scripts/batch/extract-quotes/cli.mjs` (`promptsDir`); `src/app/docs/how/page.tsx` (published on /docs/how) |

## Taxonomy prose

| File | Loaded by |
| --- | --- |
| `taxonomy/effect-categories.json` | `src/data/effectCategoryDefinitions.ts` (`EFFECT_CATEGORY_DEFINITIONS`) |
| `taxonomy/drug-classes.json` | `src/data/drugClassContent.ts` (`DRUG_CLASS_CONTENT`); `scripts/translation/ui-catalog.ts` walks it for message keys |
| `taxonomy/psychoactive-summaries.json` | `src/features/psychoactive-summaries/summaryDefinitions.ts` (`PSYCHOACTIVE_SUMMARY_DEFINITIONS`); `scripts/translation/ui-catalog.ts` walks it for message keys; `scripts/translation/corpora.mjs` through the loader |

## UI translation

| File | Loaded by |
| --- | --- |
| `i18n/localeRegistry.json` | `src/i18n/localeRegistry.mjs` (typed by `src/i18n/localeRegistry.d.ts`) |
| `i18n/messages/zh-Hans.json` | `src/i18n/ChineseMessagesProvider.tsx`; `src/i18n/serverMessages.ts`; written by `scripts/translation/ui-catalog.ts` |

## Source corpora

| File | Loaded by |
| --- | --- |
| `sources/psychonautwiki-2015/` | `scripts/data-ops/apply-subjective-effects-import.ts` reads `json/` and `subjective-effects-integration-tracker.md`; `scripts/research/collect-psychonautwiki-2015-subjective-effects.mjs` writes it. See its `README.md` and `LICENSE.md` for scope and reuse terms |
