# Cleanup Task Tracker
> **Last updated**: 2026-04-23 14:06 MDT | **Status**: Code cleanup plus final structure pass complete | ✅ 18/18 code plans executed (100%) | ✅ 1/1 structure pass complete

This tracker now reflects the clarified scope: **code files only**. Oversized markdown plans, reports, prompt docs, skill docs, lockfiles, JSON data artifacts, and archival exports are no longer part of the active cleanup burn-down.

The authoritative active scope is:

- TypeScript, JavaScript, and CSS implementation files
- Generated/config code only where generation shape affects maintainability
- Deprecated script code where retirement or containment is part of the code cleanup

## Scope Change

On 2026-04-23, the user clarified that the cleanup program should target **code only**, not historical markdown plans or other oversized non-code artifacts.

As a result:

- non-code cleanup plans remain in `cleanup/plans/` as archive context only
- non-code work is **retired from active scope**
- prior markdown-only cleanup work is excluded from code-progress accounting

## Code Cleanup Standard

- Active logic should usually end below 500 LOC, with clearer responsibilities, direct tests, and smaller entrypoints.
- Styling code should be separated by responsibility so global files are no longer monoliths.
- Generated/config code should be structured by the generator, not hand-maintained giant blobs.
- Deprecated script code should be removed, quarantined, or intentionally isolated.
- After any implementation task, update this tracker before touching the next plan.

## In-Scope Categories

| Category | Files |
|---|---:|
| Active logic | 15 |
| Config-heavy | 1 |
| Generated/config | 1 |
| Deprecated code | 1 |

## Out-Of-Scope Categories

These are intentionally excluded from the active cleanup burn-down:

| Category | Files |
|---|---:|
| Documentation | 7 |
| Prompt doc | 4 |
| Skill doc | 17 |
| Data artifact | 10 |
| Artifact archive | 12 |
| Lockfile | 2 |

## Folder Order

| Folder | Files | Done | Remaining | Completion |
|---|---:|---:|---:|---|
| `src` | 4 | 4 | 0 | ✅ Complete |
| `scripts` | 14 | 14 | 0 | ✅ Complete |

## Active Execution Queue

### `src`
| ID | Priority | LOC | Category | File | Plan | Status |
|---|---|---:|---|---|---|---|
| CLN-011 | P0 | 548 | Active logic | `src/schema/substance.schema.ts` | [plan](./plans/src-schema-substance-schema-ts.md) | ✅ DONE |
| CLN-017 | P1 | 1775 | Active logic | `src/styles.css` | [plan](./plans/src-styles-css.md) | ✅ DONE |
| CLN-022 | P1 | 629 | Generated/config | `src/data/schema/fieldRegistry.generated.ts` | [plan](./plans/src-data-schema-fieldregistry-generated-ts.md) | ✅ DONE |
| CLN-024 | P1 | 603 | Config-heavy | `src/data/schema/fieldOverrides.ts` | [plan](./plans/src-data-schema-fieldoverrides-ts.md) | ✅ DONE |

### `scripts`
| ID | Priority | LOC | Category | File | Plan | Status |
|---|---|---:|---|---|---|---|
| CLN-004 | P0 | 935 | Active logic | `scripts/parsers/erowid.ts` | [plan](./plans/scripts-parsers-erowid-ts.md) | ✅ DONE |
| CLN-005 | P0 | 871 | Active logic | `scripts/parsers/psychonautwiki.ts` | [plan](./plans/scripts-parsers-psychonautwiki-ts.md) | ✅ DONE |
| CLN-006 | P0 | 854 | Active logic | `scripts/data/reorder-fields.mjs` | [plan](./plans/scripts-data-reorder-fields-mjs.md) | ✅ DONE |
| CLN-007 | P0 | 835 | Active logic | `scripts/prepopulate/prepopulate-dosage-duration.mjs` | [plan](./plans/scripts-prepopulate-prepopulate-dosage-duration-mjs.md) | ✅ DONE |
| CLN-008 | P0 | 827 | Active logic | `scripts/batch/batch-generate-dosage-duration.mjs` | [plan](./plans/scripts-batch-batch-generate-dosage-duration-mjs.md) | ✅ DONE |
| CLN-009 | P0 | 781 | Active logic | `scripts/batch/batch-generate-harm-potential.mjs` | [plan](./plans/scripts-batch-batch-generate-harm-potential-mjs.md) | ✅ DONE |
| CLN-010 | P0 | 748 | Active logic | `scripts/parsers/tripsit.ts` | [plan](./plans/scripts-parsers-tripsit-ts.md) | ✅ DONE |
| CLN-021 | P1 | 674 | Active logic | `scripts/batch/batch-generate-history-culture.mjs` | [plan](./plans/scripts-batch-batch-generate-history-culture-mjs.md) | ✅ DONE |
| CLN-023 | P1 | 614 | Active logic | `scripts/data/generateCoverageReport.ts` | [plan](./plans/scripts-data-generatecoveragereport-ts.md) | ✅ DONE |
| CLN-026 | P1 | 592 | Active logic | `scripts/batch/batch-extract-quotes.mjs` | [plan](./plans/scripts-batch-batch-extract-quotes-mjs.md) | ✅ DONE |
| CLN-027 | P1 | 572 | Active logic | `scripts/batch/batch-generate-legality.mjs` | [plan](./plans/scripts-batch-batch-generate-legality-mjs.md) | ✅ DONE |
| CLN-029 | P1 | 559 | Active logic | `scripts/migrate/migrate-effects.mjs` | [plan](./plans/scripts-migrate-migrate-effects-mjs.md) | ✅ DONE |
| CLN-030 | P1 | 551 | Active logic | `scripts/parsers/drugbank.ts` | [plan](./plans/scripts-parsers-drugbank-ts.md) | ✅ DONE |
| CLN-055 | P2 | 710 | Deprecated code | `scripts/deprecated/splitDurationByRoute.mjs` | [plan](./plans/scripts-deprecated-splitdurationbyroute-mjs.md) | ✅ DONE |

## Retired From Active Scope

The following work is no longer counted toward cleanup completion because it is not code:

- markdown plan, report, and guide splits
- prompt-document consolidation outside the active code path
- JSON and archive governance plans
- skill-document and lockfile restructuring

Those plan files remain available for reference in `cleanup/plans/`, but they are not part of the active code cleanup commitment.

## Final Structure Pass

### STR-001 | P1 | ✅ DONE
**Retire tracked root `api/_utils` helpers after the App Router migration**
- **Why**: The root `api/` directory was no longer the active API route surface, but a tracked `_utils` island remained and made the repo map harder to read.
- **Changes**:
  - moved GitHub API client helpers to `lib/server/github/client.js`
  - moved GitHub payload validation helpers to `lib/server/github/validation.js`
  - moved shared server logging to `lib/server/logger.js`
  - updated `lib/server/github/saveSubstanceIndex.js` and `lib/server/github/saveUserProfile.js` imports
  - repointed `npm run lint:api` from the retired root `api/` folder to `src/app/api/`
  - removed unused legacy `parseBody`, password, and Pages API rate-limit helpers from `api/_utils`
- **Verification**:
  - `npm run test -- lib/server/github/validation.test.ts`
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run lint:api`
  - `npm run cleanup:metrics -- --json --check`

## Definition Of Done

- Every in-scope code plan above is completed or consciously retired with justification.
- Active logic hotspots have tests or characterization coverage before decomposition and remain within explicit budgets afterward.
- Styling, generated code, and deprecated script code are brought under the same maintainability standard as the rest of the implementation surface.
- Root cleanup docs are refreshed once the code-only scope is complete.

## Execution Notes

- `CLN-011` completed on 2026-04-23: split `src/schema/substance.schema.ts` into domain modules under `src/schema/substance/` while keeping the public barrel stable.
- Verification for `CLN-011`: `npm run test -- src/schema/substance.schema.test.ts` and `npm run generate:schema`.
- `CLN-024` completed on 2026-04-23: split manual field overrides into section-owned modules under `src/data/schema/fieldOverrides/` and added duplicate-path protection.
- Verification for `CLN-024`: `npm run test -- src/data/schema/fieldOverrides.test.ts src/schema/substance.schema.test.ts` and `npm run typecheck`.
- `CLN-022` completed on 2026-04-23: changed schema generation to emit `fieldRegistry.generated.ts` as a barrel over per-domain shards in `src/data/schema/fieldRegistry.generated/`.
- Verification for `CLN-022`: `npm run generate:schema` and `npm run typecheck`.
- `CLN-017` completed on 2026-04-23: split the global stylesheet into dedicated partials for base tokens, theme overrides, lightbox styling, shared utilities, and typography utilities while keeping `src/styles.css` as the thin entry surface.
- Verification for `CLN-017`: `npm run build` and `wc -l src/styles.css src/styles/*.css`.
- `CLN-004` completed on 2026-04-23: split the Erowid parser into focused helpers under `scripts/parsers/erowid/` for sections, dosage, duration, effects, legal parsing, harm parsing, and narrative collection while keeping `scripts/parsers/erowid.ts` as the public facade.
- Verification for `CLN-004`: `npm run test -- lib/erowidParser.test.ts lib/parserContracts.test.ts`, `npm run typecheck`, and `wc -l scripts/parsers/erowid.ts scripts/parsers/erowid/*.ts`.
- `CLN-005` completed on 2026-04-23: decomposed the PsychonautWiki parser into focused helpers under `scripts/parsers/psychonautwiki/` for route parsing, effects taxonomy, safety parsing, legal parsing, structured chemistry/pharmacology extraction, and narrative collection while keeping `scripts/parsers/psychonautwiki.ts` as the facade.
- Verification for `CLN-005`: `npm run test -- lib/psychonautwikiParser.test.ts lib/parserContracts.test.ts`, `npm run typecheck`, and `wc -l scripts/parsers/psychonautwiki.ts scripts/parsers/psychonautwiki/*.ts`.
- `CLN-010` completed on 2026-04-23: separated shared TripSit route/effect/safety parsing from factsheet- and wiki-specific narrative/meta handling under `scripts/parsers/tripsit/`, keeping `scripts/parsers/tripsit.ts` as the entry surface for both parser classes.
- Verification for `CLN-010`: `npm run test -- lib/tripsitParser.test.ts lib/parserContracts.test.ts`, `npm run typecheck`, and `wc -l scripts/parsers/tripsit.ts scripts/parsers/tripsit/*.ts`.
- `CLN-030` completed on 2026-04-23: split the DrugBank parser into focused helpers under `scripts/parsers/drugbank/` for chemistry parsing, pharmacology parsing, interaction parsing, and overview narrative assembly while keeping `scripts/parsers/drugbank.ts` as the thin adapter.
- Verification for `CLN-030`: `npm run test -- lib/drugbankParser.test.ts lib/parserContracts.test.ts`, `npm run typecheck`, and `wc -l scripts/parsers/drugbank.ts scripts/parsers/drugbank/*.ts`.
- `CLN-029` completed on 2026-04-23: isolated migration configuration, rewrite helpers, effect transformation, and batched persistence under `scripts/migrate/effects/`, leaving `scripts/migrate/migrate-effects.mjs` as the orchestration layer.
- Verification for `CLN-029`: `npm run test -- lib/migrateEffects.test.ts`, `npm run typecheck`, and `wc -l scripts/migrate/migrate-effects.mjs scripts/migrate/effects/*.mjs`.
- `CLN-023` completed on 2026-04-23: split coverage loading, report formatting, by-source analysis, overlap analysis, and top-level report assembly under `scripts/data/coverage-report/`, leaving `scripts/data/generateCoverageReport.ts` as the entrypoint.
- Verification for `CLN-023`: `npm run test -- lib/generateCoverageReport.test.ts`, `npm run typecheck`, `npx tsx scripts/data/generateCoverageReport.ts`, and `wc -l scripts/data/generateCoverageReport.ts scripts/data/coverage-report/*.ts`.
- `CLN-055` completed on 2026-04-23: fully quarantined the deprecated duration-migration script by replacing the oversized body with an explicit archived wrapper, adding an archive placeholder note, and marking the deprecated README with recovery guidance through git history.
- Verification for `CLN-055`: `node scripts/deprecated/splitDurationByRoute.mjs` and `wc -l scripts/deprecated/splitDurationByRoute.mjs scripts/deprecated/archive/splitDurationByRoute.legacy.mjs scripts/deprecated/README.md`.
- `CLN-006` completed on 2026-04-23: split the field reorder monolith into dedicated canonical-order metadata, pure reorder helper modules for dosage/duration/effects/meta sections, and standalone validation utilities under `scripts/data/reorder-fields/`, leaving `scripts/data/reorder-fields.mjs` as the CLI shell.
- Verification for `CLN-006`: `npm run test -- lib/reorderFields.test.ts`, `node scripts/data/reorder-fields.mjs --dry-run`, `npm run typecheck`, and `wc -l scripts/data/reorder-fields.mjs scripts/data/reorder-fields/*.mjs`.
- `CLN-007` completed on 2026-04-23: split dosage/duration prepopulation into dedicated normalization, dosage heuristics, duration heuristics, runner, and reporting modules under `scripts/prepopulate/dosage-duration/`, leaving `scripts/prepopulate/prepopulate-dosage-duration.mjs` as the CLI shell.
- Verification for `CLN-007`: `npm run test -- lib/prepopulateDosageDuration.test.ts`, `node scripts/prepopulate/prepopulate-dosage-duration.mjs --dry-run --substance=lsd`, `npm run typecheck`, and `wc -l scripts/prepopulate/prepopulate-dosage-duration.mjs scripts/prepopulate/dosage-duration/*.mjs`.
- `CLN-008` completed on 2026-04-23: split the dosage/duration review generator into dedicated CLI, loader, parser, OpenRouter, persistence, and helper modules under `scripts/batch/dosage-duration/`, while reusing shared batch CLI/runner/sanitization helpers and keeping the entrypoint thin.
- Verification for `CLN-008`: `npm run test -- lib/batchGenerateDosageDuration.test.ts`, `node scripts/batch/batch-generate-dosage-duration.mjs --dry-run --substance=lsd`, `npm run typecheck`, and `wc -l scripts/batch/batch-generate-dosage-duration.mjs scripts/batch/dosage-duration/*.mjs`.
- `CLN-009` completed on 2026-04-23: split the harm-potential generator into dedicated CLI, loader, OpenRouter, normalization/parser, and persistence modules under `scripts/batch/harm-potential/`, while reusing shared batch CLI/summary/sanitization helpers and keeping the entrypoint thin.
- Verification for `CLN-009`: `npm run test -- lib/batchGenerateHarmPotential.test.ts`, `node scripts/batch/batch-generate-harm-potential.mjs --dry-run --substance=lsd`, `npm run typecheck`, and `wc -l scripts/batch/batch-generate-harm-potential.mjs scripts/batch/harm-potential/*.mjs`.
- `CLN-021` completed on 2026-04-23: split the history/culture generator into dedicated CLI, loader, OpenRouter, parser, and persistence modules under `scripts/batch/history-culture/`, while reusing shared batch banner/summary output and Convex field sanitization helpers.
- Verification for `CLN-021`: `npm run test -- lib/batchGenerateHistoryCulture.test.ts`, `node scripts/batch/batch-generate-history-culture.mjs --dry-run --substance=lsd`, `npm run typecheck`, and `wc -l scripts/batch/batch-generate-history-culture.mjs scripts/batch/history-culture/*.mjs`.
- `CLN-027` completed on 2026-04-23: split the legality generator into dedicated CLI, loader, parser/prompt, OpenRouter, and persistence modules under `scripts/batch/legality/`, while reusing shared batch banner/summary output and Convex field sanitization helpers.
- Verification for `CLN-027`: `npm run test -- lib/batchGenerateLegality.test.ts`, `node scripts/batch/batch-generate-legality.mjs --dry-run --substance=lsd`, `npm run typecheck`, and `wc -l scripts/batch/batch-generate-legality.mjs scripts/batch/legality/*.mjs`.
- `CLN-026` completed on 2026-04-23: split the quote extractor into dedicated CLI, category configuration, source loading, formatting/output, OpenRouter, and runner modules under `scripts/batch/extract-quotes/`, leaving the command as a thin shell over data-driven category rules and processing stages.
- Verification for `CLN-026`: `npm run test -- lib/batchExtractQuotes.test.ts`, `node scripts/batch/batch-extract-quotes.mjs --category=legality --dry-run --limit=3`, `npm run typecheck`, and `wc -l scripts/batch/batch-extract-quotes.mjs scripts/batch/extract-quotes/*.mjs`.
