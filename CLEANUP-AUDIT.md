# Codebase Audit Report
> Generated: 2026-04-09 | Project: dose.wiki | Total source files: 435 | Total LOC: 50,758

## Executive Summary

**Overall health**: C — the codebase has solid boundaries at the app level, and the `/dev` surface has started shedding tab-specific orchestration. `CategoryEditor.tsx` and `yamlParser.ts` have both been decomposed, but the article-generation editor flow still concentrates too much async control and rendering in a few oversized components.

**Critical findings**: 5 strict god-object candidates, 6 files over 500 LOC, 22 high-complexity hotspots

**Top 3 priorities**:
1. `src/features/dev/pages/DevModePage.tsx` is narrower after the changelog and support-tab facade extraction, but it remains the largest `/dev` orchestration hub.
2. `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx` still owns API/config controls and feature composition after the first substance-editor extraction wave.
3. `src/features/dev/tools/index-layout/useIndexLayoutCategoryController.ts` is now the main remaining index-layout coupling point after the `CategoryEditor.tsx` split.

## Project Orientation

- **Stack**: TypeScript, React 18, Next.js 16 App Router, Convex, Auth.js, Tailwind CSS, Vitest
- **Architecture**: App-router monolith with feature folders and Convex-backed runtime data
- **Test runner**: Vitest via `npm run test`
- **Linter**: ESLint via `npm run lint`
- **Build**: `npm run build`

## God Objects & Bloated Files

| # | File | LOC | Methods | Fields | Max CC | Deps | Responsibilities | Severity |
|---|------|-----|---------|--------|--------|------|-----------------|----------|
| 1 | `src/features/dev/pages/DevModePage.tsx` | 2009 | 1 | 284 | 351 | 25 | editor state, save flows, article create/edit wiring, commit panel orchestration | 🔴 CRITICAL |
| 2 | `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx` | 499 | 1 | 86 | 79 | 15 | API/config controls, output modes, section composition, save affordances | 🔴 CRITICAL |
| 3 | `src/features/article/components/sections/HistoryCultureSection.tsx` | 617 | 7 | 37 | 50 | 4 | article rendering, citation formatting, timeline formatting, markdown/layout variants | 🟠 HIGH |
| 4 | `src/data/builders/libraryBuilder.ts` | 541 | 2 | 98 | 24 | 7 | library assembly, taxonomy transforms, interaction wiring, lookup construction | 🟠 HIGH |
| 5 | `src/features/article/components/sections/SubjectiveEffectsSection.tsx` | 528 | 10 | 37 | 39 | 9 | article rendering, grouped effect presentation, citations, detail formatting | 🟠 HIGH |

`DevModePage.tsx` now delegates changelog state/rendering to `useDevModeChangeLog.ts` and `DevModeChangeLogTab.tsx`, and about/profile/tag prop shaping to `useDevModeSupportTabProps.ts`. It still owns too many article-editor and save-flow responsibilities, but the tab-specific seams are now explicit and independently testable.

`SubstanceEditorTab.tsx` is now down to the tab shell plus API-key/model controls and section layout. Source aggregation moved to `useSubstanceEditorSourceData.ts`, draft/save orchestration moved to `useSubstanceEditorDraftController.ts`, and article matching/upsert rules moved to `substanceEditorDraftUtils.ts`.

`useSectionGeneration.ts` now delegates prompt construction, section-content detection, token estimation, and adaptive reasoning policy to `sectionGenerationUtils.ts`. The remaining hook body is still stateful and async-heavy, but its policy surface is now explicit and reusable.

`IndexLayoutTab.tsx` has now been reduced to the tab shell and dataset/save wiring. The drag/drop and category manipulation logic lives in `useIndexLayoutCategoryController.ts`, which is now the primary remaining index-layout control hotspot after the `CategoryEditor.tsx` split.

`yamlParser.ts` has been decomposed into a 135 LOC parse facade plus focused normalization modules: `yamlParserSectionNormalizers.ts` (327 LOC), `yamlParserHarmPotential.ts` (203 LOC), and `yamlParserShared.ts` (128 LOC). The former 706 LOC parser hotspot is no longer a current god-object candidate, and the extracted harm-potential path now tops out below the previous high-complexity threshold.

`CategoryEditor.tsx` has been reduced to 441 LOC after extracting `categoryEditorUtils.ts` (210 LOC), `CategoryEditorDetailsPanel.tsx` (55 LOC), and helper tests in `categoryEditorUtils.test.ts`. The main file now focuses on editor composition while the immutable category/section mutations and slug-derivation logic live in smaller, testable seams.

## Complexity Hotspots

| File | Method/Function | LOC | CC | Nesting | Issue |
|------|----------------|-----|-----|---------|-------|
| `src/features/dev/pages/DevModePage.tsx` | `DevModePage` | 1891 | 351 | 14 | Large `/dev` shell still owns article-editing and save orchestration |
| `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx` | `SubstanceEditorTab` | 434 | 79 | 9 | UI shell still owns API/config controls and feature composition |
| `src/features/dev/tools/index-layout/useIndexLayoutCategoryController.ts` | `useIndexLayoutCategoryController` | 239 | 37 | 7 | Drag/drop and category edit control flow still concentrated in one hook |
| `src/features/dev/forms/ChemistryFieldsRHF.tsx` | default component body | 306 | 89 | 10 | Dense form composition and branching logic |
| `src/features/dev/tools/substance-editor/useSectionGeneration.ts` | generation pass orchestration | 389 | 58 | 7 | Retry/fallback logic is improved but still broad for one hook |
| `src/components/common/GlobalSearch.tsx` | `GlobalSearch` | 353 | 61 | 13 | Search state, fetching, keyboard behavior, and navigation tightly coupled |
| `src/features/dev/profile/ProfileEditorTab.tsx` | default component body | 337 | 58 | 7 | Preview, edit state, save state, and diff rendering all co-located |
| `src/features/effects/vcode/VCodeRenderer.tsx` | `VCodeRenderer` | 298 | 55 | 8 | Many rendering branches in a single renderer |

## Anti-Pattern Findings

### 🔴 CRITICAL (P0) — Blocks maintainability; fix first

1. `src/features/dev/pages/DevModePage.tsx:91` still concentrates save routing, article creation/editing flow, and commit-panel rendering in one component. The changelog filters/rendering and the about/profile/tag tab adapters have been extracted, but the shell remains high-risk until the substance-editor path is carved out further.
2. `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx:1` still coordinates API/config controls, output modes, and section-editor composition in one shell component.

### 🟠 HIGH (P1) — Significant technical debt

1. `src/features/dev/tools/substance-editor/useSectionGeneration.ts:78` still contains a large async orchestration path with retries and fallback behavior in one hook, even after the pure reasoning policy and prompt-building helpers were extracted.
2. `src/features/dev/tools/index-layout/useIndexLayoutCategoryController.ts:31` now centralizes the remaining drag/drop and category mutation control flow for the index-layout editor. `CategoryEditor.tsx` is slimmer, but this controller is the next likely split point.
3. `src/features/article/components/sections/HistoryCultureSection.tsx:1` carries too many presentation variants and formatting concerns in a single file.
4. `src/features/dev/profile/ProfileEditorTab.tsx:1` still mixes preview rendering, edit state, save state, and diff output in one tab component.

### 🟡 MEDIUM (P2) — Moderate issues; schedule for cleanup

1. `src/components/common/GlobalSearch.tsx:1` remains a large interaction component even after test coverage was added.

### 🔵 LOW (P3) — Minor; fix opportunistically

1. `src/data/schema/fieldOverrides.ts:1` and `src/utils/data/tagRegistry.ts:1` are large data-centric files rather than high-risk logic hotspots, but they still hurt navigability.
2. `lib/server/github/saveUserProfile.js:1` and `lib/server/github/saveSubstanceIndex.js:1` could share more validation/commit helper logic later.

## DRY Violations

| Code Block Description | Locations | Lines Duplicated |
|-----------------------|-----------|-----------------|
| No currently tracked high-signal duplication after the About-editor helper extraction | — | — |

## Dependency Issues

- Circular dependencies found: none in the direct local-import graph scan
- Active `@/features/dev` barrel imports in app-shell code: 0 after the `NextDevRouteClient` import cleanup
- Most-depended-on files (coupling hubs): `src/components/common/Icon.tsx` (124), `src/schema/index.ts` (68), `src/components/ui/button.tsx` (57), `src/lib/utils.ts` (35)
- Tightly coupled pairs: `src/features/dev/pages/DevModePage.tsx` ↔ article-create/article-save modules, `src/features/dev/tools/index-layout/IndexLayoutTab.tsx` ↔ `CategoryEditor.tsx`, `src/features/dev/tools/substance-editor/useSubstanceEditorSourceData.ts` ↔ quote/source-preview helpers

## Metrics Summary

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Max file LOC | 2009 | <500 | ❌ |
| Avg file LOC | 116.7 | <300 | ✅ |
| Max method CC | 423 | <10 | ❌ |
| Avg method CC | Hotspots still concentrated in `/dev` | <5 | ❌ |
| Files >500 LOC | 6 | 0 | ❌ |
| God objects | 5 strict candidates | 0 | ❌ |
| Circular deps | 0 direct cycles found | 0 | ✅ |
| DRY violations | 0 high-signal duplicates logged | 0 | ✅ |
| Dead code blocks | Not fully audited yet | 0 | ❌ |
