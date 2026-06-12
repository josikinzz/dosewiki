# Codebase Audit Report
> Generated: 2026-04-23 14:06 MDT | Project: dose.wiki | Total source files: 815 | Total LOC: 83,567

> Scope note (2026-04-23): this audit summarizes the earlier cleanup wave that produced the root-level tracker.
> The active oversized-file cleanup execution plan now lives in [archive/cleanup/CLEANUP-TASKS.md](archive/cleanup/CLEANUP-TASKS.md) and excludes markdown/non-code files from progress accounting.
> Final note (2026-04-23): the code-only cleanup execution tracked in `archive/cleanup/CLEANUP-TASKS.md` is complete.
> Structure note (2026-04-23): a final organization pass retired the tracked root `api/_utils` helper island; active server GitHub helpers now live under `lib/server/`.

## Executive Summary

**Overall health**: B+ — the oversized-file cleanup is complete, active code is under the 500 LOC ceiling, and the remaining structure reads as feature-owned code plus clearly separated server/script infrastructure.

**Current findings**: 0 active-logic files over 500 LOC, 0 generated/config files over 500 LOC, 7 tracked hotspot budgets all passing.

**Watchlist**:
1. Keep `src/features/dev/tools/index-layout/CategoryEditor.tsx`, `src/features/dev/tags/TagEditorTab.tsx`, and `src/features/dev/pages/useDevModePageController.ts` from regrowing into mixed controller/view surfaces.
2. Keep script entrypoints thin as the batch/parser modules evolve; the source-specific parser and batch folders are now organized by domain and should stay that way.
3. Avoid reintroducing tracked code under the legacy root `api/`; App Router handlers belong in `src/app/api/`, and reusable server helpers belong in `lib/server/`.

## Verification Baseline

- `npm run cleanup:metrics -- --json --check` ✅
- `npm run test` ✅ — 57 files, 215 tests passed
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run lint:api` ✅

## Repository Shape Summary

| Area | Files | LOC | Files >300 LOC | Files >500 LOC |
|------|-------|-----|----------------|----------------|
| `src` | 511 | 50,522 | 22 | 0 |
| `lib` | 44 | 4,164 | 1 | 0 |
| `api` | 0 | 0 | 0 | 0 |
| `convex` | 23 | 2,946 | 2 | 0 |
| `scripts` | 236 | 25,594 | 9 | 0 |
| `eslint-plugins` | 1 | 341 | 1 | 0 |

`scripts/` remains the largest maintenance surface by volume, but its major entrypoints now use focused submodules. The root `api/` source bucket is empty by design after the App Router migration; keep it that way unless a new platform-specific reason appears.

## File Categories

| Category | Files | LOC | Files >300 LOC | Files >500 LOC |
|----------|-------|-----|----------------|----------------|
| Active logic | 798 | 81,907 | 34 | 0 |
| Generated/config-heavy | 3 | 203 | 0 | 0 |
| Deprecated | 14 | 1,457 | 1 | 0 |

The important distinction now exists in the metrics script itself, so generated/config-heavy files no longer distort cleanup review discussions.

## Completed Cleanup Outcomes

| Area | Before | After |
|------|--------|-------|
| Parser utilities | `scripts/parsers/base.ts` was a 700+ LOC shared god object | Split into focused modules under `scripts/parsers/base/`; `base.ts` is now an 83 LOC facade |
| Pharmacology batch pipeline | `batch-generate-pharmacology.mjs` combined CLI, runtime, YAML repair, and persistence | Thin 130 LOC entrypoint over focused `scripts/batch/pharmacology/*.mjs` modules |
| Generated pharmacology application | `ChemistryFieldsRHF.tsx` owned route normalization and cross-section mutation inline | Logic extracted to `pharmacologyApplyGenerated.ts` with direct tests |
| `/dev` page shell | `DevModePage.tsx` mixed orchestration and rendering | Split into `useDevModePageController.ts`, `DevModePageView.tsx`, and a thin `DevModePage.tsx` |
| VCode rendering | `VCodeRenderer.tsx` used a large switch as the only extension seam | Tag registry moved to `src/features/effects/vcode/renderers.tsx` with direct render/fallback tests |
| Cleanup process | Metrics were passive and easy to ignore | `cleanup-metrics` now has hotspot budgets and `--check` mode for regression detection |
| Server helper structure | Tracked root `api/_utils` files remained after route-handler migration | Active GitHub helpers moved under `lib/server/github`, shared logging moved to `lib/server/logger.js`, stale lint script targeting was updated, and unused legacy helpers were removed |

## Current Hotspots

### 🔴 P1

No active P1 file-structure blockers remain in the current scan.

### 🟠 P2

1. `src/features/dev/tools/index-layout/CategoryEditor.tsx` (414 LOC) is still the largest active `/dev` UI hotspot and remains the best candidate for a future controller/view extraction if it grows.
2. `src/features/dev/tags/TagEditorTab.tsx` (374 LOC) and `src/features/dev/pages/useDevModePageController.ts` (372 LOC) are below the new guardrails but still large enough to watch.
3. `src/features/dev/tools/substance-editor/SectionGenerator.tsx` remains orchestration-heavy even though its repeated prop wiring was removed elsewhere.

### 🟡 P3

1. `src/data/schema/fieldRegistry.generated.ts` and `src/data/schema/fieldOverrides.ts` remain large, but they are generated/config-heavy and should not be treated like active-logic regressions.
2. `scripts/deprecated/` remains quarantined debt. It is visible in metrics now, but it is not part of the active hotspot budget.

## Hotspot Guardrails

The cleanup metrics script now tracks budgeted files that were touched in this pass. Current status:

| File | Actual LOC | Budget | Status |
|------|------------|--------|--------|
| `scripts/parsers/base.ts` | 83 | 250 | ✅ |
| `scripts/batch/batch-generate-pharmacology.mjs` | 130 | 250 | ✅ |
| `src/features/dev/forms/pharmacologyApplyGenerated.ts` | 122 | 250 | ✅ |
| `src/features/dev/pages/DevModePage.tsx` | 18 | 120 | ✅ |
| `src/features/dev/pages/useDevModePageController.ts` | 372 | 450 | ✅ |
| `src/features/effects/vcode/VCodeRenderer.tsx` | 68 | 150 | ✅ |
| `src/features/effects/vcode/renderers.tsx` | 223 | 300 | ✅ |

Use `npm run cleanup:metrics -- --check` during review when touching any of these files.

## Residual Risks

- The repo has no current active-logic files above 500 LOC, but several 300-450 LOC files are still worth watching during feature work.
- `useDevModePageController.ts` is acceptable for this pass but is still carrying enough orchestration to warrant future decomposition if `/dev` grows further.
- The ignored filesystem still contains generated build/test output directories and `.DS_Store` files; they are not tracked code, but they make raw `find` output noisy.
