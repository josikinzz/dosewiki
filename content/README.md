# content/

Authored prose and prompt text that the application, its seed scripts, and its translation tooling load. Structured datasets live in `data/` instead.

Application code reaches these files through the `@content/*` alias in `tsconfig.json`, `vitest.config.ts`, and `scripts/test/vitest.workflow.config.ts`. Plain `.mjs` scripts use relative paths. Markdown is imported with `?raw`, and JSON is imported directly.

Two areas are not hand-edited. `scripts/translation/ui-catalog.ts` generates `content/i18n/messages/*.json`. In `sources/psychonautwiki-2015/`, a one-time collector run wrote `articles/*.md` and `not-found-2015.md`, and `json/*.json` holds the import drafts converted from those captures. That corpus's `README.md` began as collector output and is now edited by hand, like its `LICENSE.md`, its integration tracker, and everything else here. `data/lineage.json` records the edit policy for each tracked prompt, taxonomy, and message file, and for each collector capture and import draft.

| Directory | Contents |
| --- | --- |
| `about/` | About page prose, its subtitle, founder keys, the Partners and Community roster, and the Effect Index mission text. Postgres holds the live dose.wiki About document, and these files seed it. |
| `copy-blocks/` | `copyBlocks.json`, the Copy Studio defaults and reset target |
| `prompts/` | `registry.json` and the generator, section, and formal-citation prompts it names, plus the extraction prompts, which the registry does not name. `/docs/how` publishes the section and extraction prompts. |
| `taxonomy/` | Effect category, drug class, and psychoactive summary prose |
| `i18n/` | `localeRegistry.json` and the generated UI message catalogs |
| `sources/` | Recovered source corpora, such as the 2015 to 2016 PsychonautWiki subjective-effects corpus, each with its own `README.md` and `LICENSE.md` |
