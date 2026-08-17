# Cleanup Audit

> Updated: 2026-08-16 | Project: dose.wiki | Metric source: `scripts/analyze/cleanup-metrics.ts`

## Final Result

The cleanup guardrail is clean. The current checked scan reports **2,124 source files** and **299,360 nonblank, non-comment LOC**. All **41 reviewed file budgets** and all **8 focused hotspot thresholds** pass. No budget was raised merely to clear a failure.

| Category | Files | LOC | Files >300 LOC | Files >500 LOC |
|---|---:|---:|---:|---:|
| Active logic | 1,541 | 213,110 | 172 | 26 |
| Tests | 536 | 77,555 | 47 | 7 |
| Static registries | 6 | 4,415 | 5 | 5 |
| Cohesive document components | 3 | 3,841 | 3 | 3 |
| Generated/config-heavy | 3 | 213 | 0 | 0 |
| Deprecated | 35 | 226 | 0 | 0 |

The category default remains 500 LOC. Classification makes intentional tests, registries, generated/config-heavy files, and cohesive public documents visible without exempting them. Every file above its category default has an explicit owner, reason, review date, and file-specific ceiling in `scripts/analyze/cleanup-metrics-policy.ts`.

## Verified Cleanup

- Removed the unused `src/utils/sectionSources.ts` compatibility module, retired static prompt wrappers, empty compatibility exports, and stale instructions that directed agents toward retired static prompt loading.
- Removed the unused `tokenx` and `@iconify-json/lucide` dependencies. Declared the directly imported `ignore` and `undici` script dependencies instead of relying on transitive installation.
- Corrected README and archived-cleanup links that still targeted removed HTML or planning files.
- Consolidated the duplicate subjective-effect record-field hooks behind one private typed implementation.
- Extracted OpenChemLib-independent molecule transforms from `OclEditor.tsx`; the focused transform module owns its direct tests.
- Split oversized editor controllers and views for warning banners, replication curation, molecules, trip reports, review settings, contributor profiles, and writing.
- Split public route loaders and route tests by domain while preserving the existing route-loader exports used by App Router pages.
- Split public Convex read catalog/projections, replication reads/writes/policy, contributor profile handlers, substance projection/handler families, and schema validator families.
- Split contributor identity/avatar and replication media/transcode scripts into focused planner, policy, I/O, reporting, and fixture modules.
- Split oversized workflow suites around shared fixtures rather than duplicating setup.
- Refreshed the deterministic OpenChemLib artifact manifest after verifying that the committed runtime artifacts already matched the focused source change.
- Classified all detected production writers at their existing guarded write boundaries and recorded lineage for four previously undocumented generated/reviewed artifacts.
- Updated the stale cleanup metric implementation and audit. The executable scanner is 320 LOC; policy/data is isolated in `cleanup-metrics-policy.ts`.
- Removed 14 redundant export forms after confirming all callers use the retained named exports; preserved the one alias pair with callers on both names.
- Repaired the legality validator test/CLI contract and added it to the script test graph; script lint now completes without warnings.

## Focused Hotspot Thresholds

| File | Actual LOC | Budget | Status |
|---|---:|---:|---|
| `scripts/parsers/base.ts` | 83 | 250 | pass |
| `scripts/batch/batch-generate-pharmacology.mjs` | 150 | 250 | pass |
| `src/features/dev/pages/DevModePage.tsx` | 19 | 120 | pass |
| `src/features/dev/pages/useDevModePageController.ts` | 278 | 450 | pass |
| `src/features/effects/vcode/VCodeRenderer.tsx` | 75 | 150 | pass |
| `src/features/effects/vcode/renderers.tsx` | 431 | 450 | pass |
| `src/features/dev/tools/molecule-editor/OclEditor.tsx` | 361 | 400 | pass |
| `src/features/dev/tools/molecule-editor/moleculeTransforms.ts` | 161 | 250 | pass |

## Verification

- `bun install --frozen-lockfile`
- `npm run verify:all`
  - OpenChemLib fork verification: pass
  - application tests: 421 files, 3,433 passed, 2 todo
  - application lint, API lint, and TypeScript: pass
  - production build: pass; 2,185 static pages generated
  - workflow node tests: 64 passed
  - workflow Vitest tests: 105 files, 995 passed
  - script and Convex TypeScript checks: pass
  - cleanup metrics and generated-data provenance: pass
- Production-server smoke: `/`, `/docs/code`, `/docs/how`, `/api/v1`, `/substances`, `/effects`, `/replications`, `/dmt`, and `/contributors/josie` all returned HTTP 200.
- `git diff --check`: pass.

## Remaining Advisory Candidates

No verified guardrail failure remains. The following scanner output is intentionally not treated as deletion authority:

- Knip reports 82 unused files, primarily standalone CLIs, historical run artifacts, deprecated scripts, vendor sources, and protected in-progress Effect Index files. Deleting them requires owner/archive decisions.
- Knip reports 791 unused value exports and 369 unused type exports. Many are public interfaces, test seams, schema exports, or compatibility façades; bulk removal is unsafe without caller-by-caller ownership review.
- Knip reports four unused dev dependencies inside the vendored OpenChemLib package and two unlisted media dependencies in an unreferenced replication migration script. Neither vendored dependency edits nor migration archival belongs in this cleanup.
- The production build reports that the contributor page payload exceeds Next.js's 2 MB data-cache item limit. The build and routes succeed; reducing that payload is a performance/data-shaping task, not a dead-code cleanup.

These candidates remain protected until a maintainer identifies an owning workflow or approves archival/removal.
