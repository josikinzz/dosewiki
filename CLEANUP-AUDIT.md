# Codebase Audit Report
> Generated: 2026-04-22 15:26 MDT | Project: dose.wiki | Total source files: 670 | Total LOC: 82,508

## Executive Summary

**Overall health**: B — the highest-risk parser and `/dev` orchestration hotspots from the start of this pass have been broken down, and the remaining debt is now concentrated in a smaller set of oversized script utilities rather than cross-cutting runtime/editor bottlenecks.

**Critical findings**: 4 active god-object candidates, 11 files over 500 LOC, 19 files still above the current active-logic hotspot line in `scripts/`

**Top 3 priorities**:
1. `scripts/batch/batch-generate-pharmacology.mjs` is still the largest active logic file in the repo even after the shared-runner migration.
2. `scripts/parsers/base.ts` and `scripts/parsers/erowid.ts` are now the most obvious parser-side complexity hotspots after the `others.ts` and TripSit decompositions.
3. `scripts/data/reorder-fields.mjs` and `scripts/prepopulate/prepopulate-dosage-duration.mjs` are now prominent script-only debt targets that stand out more clearly because the previous `/dev` and parser hotspots were reduced.

## Project Orientation

- **Stack**: Next.js 16 App Router, React 18, TypeScript, Auth.js, Convex, Tailwind CSS, Vitest, ESLint, Bun-backed scripts, selected `.mjs`/`.js` operational tooling
- **Architecture**: single Next.js app with Convex as the runtime source of truth, plus a large local tooling layer for parsing, migrations, batch generation, and export/import workflows
- **Test runner**: Vitest via `npm run test`
- **Linter**: ESLint via `npm run lint`
- **Build / type validation**: `npm run build`, `npm run typecheck`
- **Top-level shape**:
  - `src/` app/runtime UI, hooks, builders, local artifacts
  - `lib/` shared server and runtime helpers
  - `convex/` backend functions and validators
  - `api/` legacy route-adjacent utilities
  - `scripts/` parsing, migration, batch generation, and data maintenance tooling
- **Audit note**:
  - `src/data/schema/fieldRegistry.generated.ts` is generated and should not be treated as a manual refactor target
  - `src/data/schema/fieldOverrides.ts` is config-heavy, large, and awkward to navigate, but it is not the same kind of risk as the active logic hotspots

## Verification Baseline

- `npm run typecheck` ✅
- `npm run test` ✅ (`36` files, `170` tests)
- `npm run lint` ✅
- `npm run cleanup:metrics` ✅

## Repository Shape Summary

| Area | Files | LOC | Files >300 LOC | Files >500 LOC |
|------|-------|-----|----------------|----------------|
| `src/` | 463 | 49,839 | 28 | 2 |
| `lib/` | 26 | 2,535 | 1 | 0 |
| `api/` | 9 | 626 | 0 | 0 |
| `convex/` | 23 | 2,946 | 2 | 0 |
| `scripts/` | 148 | 26,221 | 25 | 11 |
| `eslint-plugins/` | 1 | 341 | 1 | 0 |

The maintainability problem is now decisively script-heavy. The app layer no longer has any 500+ LOC runtime/editor logic files from this cleanup tracker, while the remaining active 500+ LOC files are concentrated in `scripts/`. This pass also left the repo with a repeatable `npm run cleanup:metrics` baseline and a completed cleanup tracker rather than the previous stale “done” state.

## God Objects & Bloated Files

| # | File | LOC | Methods | Fields | Max CC | Deps | Responsibilities | Severity |
|---|------|-----|---------|--------|--------|------|-----------------|----------|
| 1 | `scripts/batch/batch-generate-pharmacology.mjs` | 735 | 97 | — | 29 | 4 | CLI parsing, backup/write flow, Convex reads, OpenRouter prompting, section normalization | 🔴 CRITICAL |
| 2 | `scripts/parsers/base.ts` | 701 | 48 | — | 63 | 0 | parser cleanup helpers, dose parsing, duration parsing, normalization | 🔴 CRITICAL |
| 3 | `scripts/parsers/erowid.ts` | 656 | 54 | — | 46 | 2 | source parsing, route extraction, effect/narrative mapping | 🟠 HIGH |
| 4 | `scripts/data/reorder-fields.mjs` | 628 | 35 | — | 31 | 1 | schema-aware field ordering, normalization, batch rewrite flow | 🟠 HIGH |
| 5 | `scripts/batch/batch-generate-dosage-duration.mjs` | 613 | 72 | — | 23 | 3 | article selection, quote/source loading, generation orchestration, persistence | 🟠 HIGH |
| 6 | `scripts/parsers/psychonautwiki.ts` | 612 | 58 | — | 52 | 2 | route parsing, effect mapping, structured extraction | 🟠 HIGH |
| 7 | `scripts/batch/batch-generate-harm-potential.mjs` | 603 | 68 | — | 38 | 3 | generation gating, normalization, prompt/runtime wiring, persistence | 🟠 HIGH |
| 8 | `scripts/prepopulate/prepopulate-dosage-duration.mjs` | 584 | 41 | — | 29 | 3 | article selection, prepopulation mapping, persistence | 🟠 HIGH |
| 9 | `scripts/parsers/tripsit.ts` | 539 | 49 | — | 81 | 3 | source parsing, duration adapter wiring, route normalization | 🟠 HIGH |
| 10 | `scripts/batch/batch-generate-history-culture.mjs` | 514 | 66 | — | 35 | 3 | CLI flow, prompt handling, source loading, persistence/reporting | 🟠 HIGH |

The prior top parser god object, `scripts/parsers/others.ts`, is no longer a hotspot: it is now a thin compatibility facade over `scripts/parsers/sources/*.ts`. That cleanup materially improved the parser map by making the remaining large parser files easier to rank and reason about.

`scripts/parsers/tripsit.ts` is no longer the repo’s single worst hotspot. The latest pass extracted duration parsing helpers into `scripts/parsers/tripsit-duration.ts`, which cut the file substantially and removed the most complex embedded grammar from the source adapter.

`batch-generate-pharmacology.mjs` still predates the newer summary pipeline split and remains the biggest active batch generator, but it now at least shares the same batch-runner shell, banner, and summary flow as the other migrated generators. The next script-side decomposition should split its domain logic away from the runner-facing entrypoint.

The `/dev` editor files targeted in this pass are materially smaller and better isolated. `SubstanceEditorTab.tsx` now composes dedicated API/selection/output/source sections, and `useSectionGeneration.ts` is now a UI-state wrapper around `sectionGenerationRunner.ts` plus pure helper utilities.

## Complexity Hotspots

| File | Method/Function | LOC | CC | Nesting | Issue |
|------|----------------|-----|----|---------|-------|
| `scripts/parsers/tripsit.ts` | `parseNestedDurationDict` | 495 | 159 | 11 | One function owns multiple grammar variants and route/value extraction branches |
| `scripts/data/generateCoverageReport.ts` | `generateFieldCoverageSummary` | 85 | 143 | 2 | Huge conditional accumulator and hand-written table output |
| `src/features/article/components/sections/harm-potential/HarmPotentialUtils.ts` | `normalizeHarmPotential` | 135 | 97 | 6 | Normalization and fallback repair logic are too branch-heavy |
| `src/features/dev/forms/ChemistryFieldsRHF.tsx` | `ChemistryFieldsRHF` | 312 | 89 | 10 | Form rendering is mixed with generation-apply normalization and route mutation logic |
| `src/features/dev/forms/HarmPotentialFieldsRHF.tsx` | `AddictionFieldsRHF` | 219 | 86 | 11 | Deeply nested RHF UI and normalization flow |
| `src/features/graph/SubstanceGraphCanvas.tsx` | `SubstanceGraphCanvas` | 304 | 81 | 11 | Rendering, layout, event wiring, and graph state are tightly coupled |
| `src/hooks/useApiMutations.ts` | `saveToConvex` | 121 | 71 | 10 | Fetch transport, payload shaping, response validation, and diagnostic logging are bundled |
| `src/components/common/useTagMultiSelectState.ts` | `useTagMultiSelectState` | 288 | 70 | 6 | State machine, filtering, selection, and keyboard behavior are all in one hook |
| `src/features/dev/pages/DevModePage.tsx` | `DevModePage` | 359 | 64 | 6 | Too many independent concerns are coordinated from one component |
| `src/features/dev/tools/substance-editor/SectionGenerator.tsx` | `SectionGenerator` | 315 | 63 | 12 | Presentation, controls, and generation-state branching are intertwined |
| `scripts/parsers/base.ts` | `parseDurationRange` | 79 | 63 | 4 | Shared parser helper has accumulated too many format branches |
| `src/components/common/GlobalSearch.tsx` | `GlobalSearch` | 360 | 62 | 13 | Suggestion fetching, keyboard control, mobile quirks, and UI all live together |

## Anti-Pattern Findings

### 🔴 CRITICAL (P0) — Blocks maintainability; fix first

1. `scripts/batch/batch-generate-pharmacology.mjs:1` is still the largest active logic file and remains the best candidate for a deeper batch-pipeline decomposition beyond the new shared runner shell.
2. `scripts/parsers/base.ts:1` now contains the most obvious shared-parser complexity concentration, especially around duration parsing helpers.
3. `scripts/parsers/erowid.ts:1` and `scripts/parsers/psychonautwiki.ts:1` are now the largest source-specific parser files and should be the next parser-side cleanup targets.

### 🟠 HIGH (P1) — Significant technical debt

1. `scripts/batch/batch-generate-dosage-duration.mjs:1`, `scripts/batch/batch-generate-history-culture.mjs:1`, and `scripts/batch/batch-generate-legality.mjs:1` now share the batch-runner entry shell, but still retain large script-specific selection and persistence bodies.
2. `src/features/dev/pages/DevModePage.tsx:1` still owns too much cross-tab coordination even after the editor-shell and generation-hook extractions.
3. `scripts/data/generateCoverageReport.ts:1` improved enough to fall below 500 LOC, but it remains a substantial script-side report assembler.
4. `src/hooks/useApiMutations.ts:1` is healthier after the transport split, though it still centralizes several endpoint-specific workflows.

### 🟡 MEDIUM (P2) — Moderate issues; schedule for cleanup

1. `src/components/common/GlobalSearch.tsx:1` still keeps the listbox renderer inline even after the suggestion-data hook extraction.
2. `src/features/dev/forms/ChemistryFieldsRHF.tsx:1` embeds AI-generation apply logic inside form rendering. That logic should move into a normalization helper or dedicated controller.
3. `scripts/prepopulate/prepopulate-dosage-duration.mjs:1` and `scripts/data/reorder-fields.mjs:1` are now more visible medium-term script cleanup candidates.
4. `src/features/effects/vcode/VCodeRenderer.tsx:1` remains a high-branch renderer with many element-type cases in a single component.
5. `lib/server/github/saveUserProfile.js:1` still contains GitHub payload shaping, upload handling, and profile normalization in one server helper.

### 🔵 LOW (P3) — Minor; fix opportunistically

1. `src/data/schema/fieldOverrides.ts:1` is large and hard to navigate, but it is primarily config density rather than unstable behavior.
2. `src/data/schema/fieldRegistry.generated.ts:1` is large by generation, not by maintainability failure. Track generator strategy rather than hand-editing the file.
3. `scripts/deprecated/splitDurationByRoute.mjs:1` is now properly quarantined behind the archived-scripts boundary, so it should no longer drive active cleanup prioritization.

## DRY Violations

| Code Block Description | Locations | Lines Duplicated |
|-----------------------|-----------|-----------------|
| Batch generator shell for CLI parsing, Convex bootstrap, backups, article selection, reporting | `scripts/batch/batch-generate-pharmacology.mjs:1`, `scripts/batch/batch-generate-dosage-duration.mjs:1`, `scripts/batch/batch-generate-harm-potential.mjs:1`, `scripts/batch/batch-generate-history-culture.mjs:1`, `scripts/batch/batch-generate-legality.mjs:1` | reduced by shared runner shell; remaining duplication is now mostly script-specific selection/persistence |
| OpenRouter generation orchestration and validation flow inside `/dev` | `src/features/dev/tools/substance-editor/useSectionGeneration.ts:1`, `src/features/dev/tools/substance-editor/SectionGenerator.tsx:1`, `src/features/dev/forms/ChemistryFieldsRHF.tsx:1` | ~20-60 per location |
| Search/dropdown interaction state and keyboard behavior | `src/components/common/GlobalSearch.tsx:1`, `src/components/common/useTagMultiSelectState.ts:1`, `src/hooks/useKeyboardNavigation.ts:1` | ~15-40 per location |

## Dependency Issues

- Circular dependencies found: `0`
- Most-depended-on files (local coupling hubs):
  - `convex/_generated/api.js` (`61`)
  - `src/features/dev/tools/substance-editor/yamlParser.ts` (`15`)
  - `convex/_generated/server.js` (`15`)
  - `src/features/dev/tools/index-layout/types.ts` (`14`)
  - `src/components/common/Icon.tsx` (`13`)
- Tightly coupled clusters:
  - `/dev` save and generation flow: `DevModePage.tsx`, `useDevModeSaveActions.tsx`, `SubstanceEditorTab.tsx`, `useSectionGeneration.ts`, `useApiMutations.ts`
  - parser family: `scripts/parsers/base.ts`, `scripts/parsers/tripsit.ts`, `scripts/parsers/others.ts`, `scripts/parsers/erowid.ts`, `scripts/parsers/psychonautwiki.ts`
  - batch tooling: the remaining section generators outside `scripts/batch/summary/`

## Metrics Summary

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Max file LOC | 735 | <500 | ❌ |
| Avg file LOC | 123.1 | <300 | ✅ |
| Max method CC | 81 | <10 | ❌ |
| Functions with CC > 50 | 19 | 0 | ❌ |
| Files >500 LOC | 11 | 0 | ❌ |
| Active logic files >500 LOC | 11 | 0 | ❌ |
| Runtime app logic files >500 LOC | 0 | 0 | ✅ |
| Circular deps | 0 | 0 | ✅ |
| Script/tooling files >500 LOC | 11 | 0 | ❌ |
| Generated/config large files | 2 | tracked separately | ⚠️ |

## Notes For The Next Pass

- The old cleanup tracker is no longer a trustworthy planning artifact because it reports a completed campaign while the hotspot map has shifted.
- The runtime app is healthier than the tooling layer. Future cleanup work should treat `scripts/` as the main debt frontier and `/dev` orchestration as the main runtime frontier.
- The summary batch pipeline refactor appears to have worked, and this pass brought the remaining section generators onto the same shared runner shell for entrypoint/help/reporting behavior.
- The current cleanup pass landed a full set of concrete seams: a dedicated TripSit duration helper, per-source parser modules, a shared mutation transport helper, a dedicated global-search suggestions hook, a repeatable cleanup metrics script, reusable report helpers, smaller `/dev` editor shells, and shared batch-runner usage across the remaining section generators.
- Future audits should continue separating generated/config-heavy files from active logic hotspots so the report stays actionable.
