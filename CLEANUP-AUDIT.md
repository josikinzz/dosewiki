# Codebase Audit Report
> Generated: 2026-04-22 | Project: dose.wiki | Total source files: 625 | Total LOC: 84,978

## Executive Summary

**Overall health**: C — the app shell, Convex boundary, and `/dev` surface are materially healthier than the previous audit, but the codebase still carries two concentrated debt zones: oversized editorial/runtime presentation modules in `src/` and a much heavier backlog in `scripts/`.

**Critical findings**: 5 strict god-object candidates, 19 files over 500 LOC, 18 high-complexity hotspots above the current `CC > 120` warning line

**Top 3 priorities**:
1. `scripts/batch/batch-generate-summary.mjs` still concentrates CLI parsing, Convex IO, prompt assembly, validation, retry logic, and result persistence.
2. `src/features/article/components/sections/HistoryCultureSection.tsx` still mixes a large heading taxonomy, truncation logic, and multiple rendering modes in one file.
3. `src/data/builders/libraryBuilder.ts` still owns too much cross-cutting library assembly for categories, mechanisms, effects, and lookup construction.

**Verification baseline**:
- `npm run typecheck` ✅
- `npm run test` ✅ (`29` files, `141` tests)

## Project Orientation

- **Stack**: TypeScript, React 18, Next.js 16 App Router, Convex, Auth.js, Tailwind CSS, Vitest, Bun-backed scripts, selected JavaScript/MJS maintenance tooling
- **Architecture**: app-router monolith with Convex as runtime source of truth plus a large local scripts/tooling layer for parsing, generation, migration, and synchronization
- **Test runner**: Vitest via `npm run test`
- **Linter**: ESLint via `npm run lint`
- **Build**: `npm run build`
- **Top-level shape**: runtime code in `src/`, shared server helpers in `lib/`, backend functions in `convex/`, route-adjacent legacy API helpers in `api/`, and a large operational toolchain in `scripts/`
- **Audit note**: `src/data/schema/fieldRegistry.generated.ts` is generated output and should not be treated as a manual refactor target even though it trips file-size thresholds

## God Objects & Bloated Files

| # | File | LOC | Methods | Fields | Max CC | Deps | Responsibilities | Severity |
|---|------|-----|---------|--------|--------|------|-----------------|----------|
| 1 | `scripts/parsers/others.ts` | 1426 | 0 | 237 | 639 | 0 | parser definitions, source-specific transforms, normalization rules, extraction heuristics | 🔴 CRITICAL |
| 2 | `scripts/batch/batch-generate-summary.mjs` | 966 | 41 | 110 | 203 | 2 | CLI orchestration, prompt prep, Convex reads, result validation, persistence, reporting | 🔴 CRITICAL |
| 3 | `src/features/article/components/sections/HistoryCultureSection.tsx` | 625 | 9 | 37 | 81 | 4 | heading taxonomy, text truncation, date formatting, section rendering, responsive presentation | 🔴 CRITICAL |
| 4 | `src/data/builders/libraryBuilder.ts` | 560 | 12 | 98 | 81 | 7 | record assembly, category grouping, lookup building, effect detail wiring, mechanism detail wiring | 🟠 HIGH |
| 5 | `src/features/article/components/sections/SubjectiveEffectsSection.tsx` | 538 | 13 | 37 | 94 | 9 | effect grouping, inline expansion, badge navigation, overview truncation, multi-column presentation | 🟠 HIGH |

`scripts/parsers/others.ts` appears to have become the primary tooling god object. It now behaves as a parser catalog, a normalization ruleset, and a behavior dispatcher at once. The target decomposition is a small parser registry plus per-source modules grouped by shared parsing strategy.

`scripts/batch/batch-generate-summary.mjs` still operates as an end-to-end application embedded inside one script. It should be split into CLI/options parsing, source collection, prompt construction, validation/diffing, and writeback/reporting modules so batch workflows can share the same framework.

`HistoryCultureSection.tsx` is now the most visible runtime UI hotspot. The target split is a static heading/icon registry, shared truncation/formatting helpers, and narrow presentational subcomponents for overview text, timeline entries, and heading blocks.

`libraryBuilder.ts` still owns too much of the site-wide derived-data graph. The correct direction is a coordinator module that delegates category presentation, effect lookup construction, and mechanism lookup construction to separate builders.

`SubjectiveEffectsSection.tsx` now mirrors the same pattern as `HistoryCultureSection.tsx`: too much static config and too much interaction logic in one place. It should move toward smaller effect-badge, group-renderer, and category-config modules.

## Complexity Hotspots

| File | Method/Function | LOC | CC | Nesting | Issue |
|------|----------------|-----|-----|---------|-------|
| `scripts/batch/batch-generate-summary.mjs` | top-level script flow | 966 | 203 | 7 | One script owns the full batch lifecycle |
| `scripts/parsers/others.ts` | module-level parser ruleset | 1426 | 639 | 9 | Parser logic is concentrated in a single source catalog |
| `scripts/parsers/base.ts` | parser helpers and transforms | 782 | 180 | 4 | Base parser abstractions are too broad and becoming a second hub |
| `src/features/article/components/sections/HistoryCultureSection.tsx` | section renderer | 625 | 81 | 9 | Large static taxonomy and rendering branches coexist |
| `src/features/article/components/sections/SubjectiveEffectsSection.tsx` | section renderer | 538 | 94 | 5 | Expansion behavior and grouping remain tightly coupled |
| `src/features/article/components/sections/DosageDurationSection.tsx` | section renderer | 481 | 85 | 5 | Route tabs, formatting, and plateau-special cases live together |
| `src/features/dev/tools/substance-editor/useSectionGeneration.ts` | `handleGenerate` | 142-355 | 48 | 7 | Async streaming, fallback policy, and logging remain in one hook |
| `src/features/dev/pages/useDevModeSaveActions.tsx` | `useDevModeSaveActions` | 128-411 | 46 | 6 | Credential checks, save orchestration, and UI state are blended |
| `lib/convex/publicData.ts` | public data module | 401 | 96 | 3 | Multiple domain read models are shaped inside one server helper |
| `convex/contributorProfiles.ts` | profile model/query/mutation layer | 431 | 100 | 4 | Validation, ownership, presentation, and storage resolution are co-located |
| `src/components/pages/AboutPage.tsx` | page component | 119-393 | 49 | 8 | Content page also owns JSON preview, copy, and download tool UX |
| `src/components/common/GlobalSearch.tsx` | `GlobalSearch` | 24-423 | 61 | 6 | Caching, fetch, keyboard navigation, and mobile behavior remain coupled |

## Anti-Pattern Findings

### 🔴 CRITICAL (P0) — Blocks maintainability; fix first

1. `scripts/batch/batch-generate-summary.mjs:1` still combines command parsing, read/write deployment routing, prompt construction, validation, and reporting in one file. This is the highest-value extraction target because the same structure is repeated across the batch generator family.
2. `scripts/parsers/others.ts:1` and `scripts/parsers/base.ts:1` together form a tooling hotspot where parser behavior is spread across very large source-specific and shared modules, making parser fixes risky and hard to scope.
3. `src/features/article/components/sections/HistoryCultureSection.tsx:97` mixes a very large static heading-to-icon taxonomy with runtime rendering logic. The file is large partly because of content metadata, but the metadata being embedded in the renderer still hurts cohesion and testability.

### 🟠 HIGH (P1) — Significant technical debt

1. `src/data/builders/libraryBuilder.ts:144` still acts as a central derived-data assembler for multiple domains. This is a classic builder hub that needs a thinner coordinator boundary.
2. `src/features/article/components/sections/SubjectiveEffectsSection.tsx:93` keeps interaction-heavy badge rendering, grouping, and navigation behavior in the same file as section layout.
3. `src/features/dev/pages/useDevModeSaveActions.tsx:128` mixes save workflow state, notices, credential verification, and commit-panel composition. The hook is smaller than the old `DevModePage` hub, but it is the next `/dev` orchestration candidate.
4. `lib/convex/publicData.ts:16` shapes substance, effect, report, about, and layout read models in one server module. The file is serviceable today but trending toward a read-model god object.
5. `convex/contributorProfiles.ts:12` handles validators, sanitizers, ownership rules, avatar resolution, queries, and mutations in one Convex module.

### 🟡 MEDIUM (P2) — Moderate issues; schedule for cleanup

1. `src/features/article/components/sections/DosageDurationSection.tsx:93` combines shared route rendering with plateau-specific DXM behavior that should likely live behind a dedicated plateau presenter.
2. `src/components/pages/AboutPage.tsx:13` mixes presentational content with JSON preview, clipboard fallback, and download tooling.
3. `src/features/effects/pages/EffectsIndexPage.tsx:41` embeds large category configuration maps and view-specific filtering logic directly in the page component.
4. `src/components/common/GlobalSearch.tsx:14` still owns cache state, request de-duplication, Android keyboard workarounds, and UI behavior in one component.
5. `src/utils/data/tagRegistry.ts:158` combines registry reads, mutation planning, and article rewrite mechanics. It is cohesive enough to function, but no longer small enough to stay comfortable.

### 🔵 LOW (P3) — Minor; fix opportunistically

1. `src/features/dev/tools/substance-editor/useSectionGeneration.ts` and `src/features/dev/tools/substance-editor/sectionGenerationUtils.ts` still form a source-level cycle via shared type imports. This is low-risk today because the edge is type-only, but it should still be removed by moving shared types into `types.ts`.
2. `src/data/schema/fieldOverrides.ts:1` is oversized but mostly configuration data. Treat it as a navigability problem, not a logic hotspot.
3. `src/data/schema/fieldRegistry.generated.ts:1` is intentionally generated. Its size should be managed through generator strategy, not hand refactoring.

## DRY Violations

| Code Block Description | Locations | Lines Duplicated |
|-----------------------|-----------|-----------------|
| Batch generator scaffolding for env/config parsing, Convex reads, output validation, and reporting | `scripts/batch/batch-generate-summary.mjs:1`, `scripts/batch/batch-generate-pharmacology.mjs:1`, `scripts/batch/batch-generate-dosage-duration.mjs:1`, `scripts/batch/batch-generate-harm-potential.mjs:1`, `scripts/batch/batch-generate-history-culture.mjs:1`, `scripts/batch/batch-generate-legality.mjs:1` | ~40-120 per script |
| Section-level expand/truncate/inline-detail interaction patterns | `src/features/article/components/sections/HistoryCultureSection.tsx:15`, `src/features/article/components/sections/SubjectiveEffectsSection.tsx:47`, `src/features/article/components/sections/DosageDurationSection.tsx:14` | ~15-35 per file |
| Domain shaping and excerpt/normalization helpers for public data reads | `lib/convex/publicData.ts:163`, `src/components/pages/AboutPage.tsx:22`, `src/data/builders/libraryBuilder.ts:94` | ~10-25 per location |

## Dependency Issues

- Circular dependencies found: 1 source-level cycle
  - `src/features/dev/tools/substance-editor/useSectionGeneration.ts` ↔ `src/features/dev/tools/substance-editor/sectionGenerationUtils.ts`
- Most-depended-on files (coupling hubs): `src/components/common/Icon.tsx` (131), `src/components/ui/button.tsx` (64), `src/lib/utils.ts` (35), `lib/convex/publicData.ts` (16), `src/components/common/SectionHeader.tsx` (16)
- Tightly coupled pairs:
  - `scripts/batch/batch-generate-summary.mjs` ↔ Convex read/write helpers and prompt assembly
  - `src/data/builders/libraryBuilder.ts` ↔ taxonomy/interaction/content builder modules
  - `src/features/dev/pages/useDevModeSaveActions.tsx` ↔ commit-panel UI and API mutation hooks
  - `lib/convex/publicData.ts` ↔ profile normalization helpers in `src/data/userProfiles.ts`

## Metrics Summary

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Max file LOC | 1426 | <500 | ❌ |
| Avg file LOC | 136.0 | <300 | ✅ |
| Max method CC | 639 (module-level heuristic) | <10 | ❌ |
| Avg method CC | Hotspots still concentrated in tooling and large section renderers | <5 | ❌ |
| Files >500 LOC | 19 | 0 | ❌ |
| App/runtime files >500 LOC | 6 | 0 | ❌ |
| Script/tooling files >500 LOC | 13 | 0 | ❌ |
| God objects | 5 strict candidates | 0 | ❌ |
| Circular deps | 1 source-level cycle | 0 | ❌ |
| DRY violations | 3 high-signal duplication clusters | 0 | ❌ |
| Dead code blocks | Not fully audited; generated/config files may mask true dead code count | 0 | ❌ |

## Notes For The Next Pass

- The previous cleanup wave worked: the `/dev` page shell is no longer the dominant hotspot. The backlog has shifted toward shared builders, article section renderers, and the scripts/tooling layer.
- The biggest return on investment now is not another giant UI split. It is introducing shared infrastructure for `scripts/batch/` and the parser family so future content operations stop creating new large files by default.
- Generated/config-heavy files should be tracked separately from true logic hotspots so future reports do not over-prioritize files that are large but intentionally data-dense.
