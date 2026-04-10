# Codebase Audit Report
> Generated: 2026-04-09 | Project: dose.wiki | Total source files: 435 | Total LOC: 50,758

## Executive Summary

**Overall health**: C — the codebase has solid boundaries at the app level, and the `/dev` surface has started shedding tab-specific orchestration, but the article-generation editor flow still concentrates too much async control and rendering in a few oversized components.

**Critical findings**: 6 strict god-object candidates, 8 files over 500 LOC, 23 high-complexity hotspots

**Top 3 priorities**:
1. `src/features/dev/pages/DevModePage.tsx` is narrower after the changelog and support-tab facade extraction, but it remains the largest `/dev` orchestration hub.
2. `src/features/dev/tools/index-layout/CategoryEditor.tsx` is now the main remaining index-layout coupling point after the tab shell split.
3. `src/features/dev/tools/substance-editor/yamlParser.ts` still owns too much normalization and legacy-shape repair logic.

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
| 2 | `src/features/article/components/sections/HistoryCultureSection.tsx` | 617 | 7 | 37 | 50 | 4 | article rendering, citation formatting, timeline formatting, markdown/layout variants | 🟠 HIGH |
| 3 | `src/features/dev/tools/substance-editor/yamlParser.ts` | 560 | 34 | 69 | 44 | 2 | parsing, hydration, schema normalization, legacy field handling | 🟠 HIGH |
| 4 | `src/data/builders/libraryBuilder.ts` | 541 | 2 | 98 | 24 | 7 | library assembly, taxonomy transforms, interaction wiring, lookup construction | 🟠 HIGH |
| 5 | `src/features/article/components/sections/SubjectiveEffectsSection.tsx` | 528 | 10 | 37 | 39 | 9 | article rendering, grouped effect presentation, citations, detail formatting | 🟠 HIGH |
| 6 | `src/features/dev/tools/index-layout/CategoryEditor.tsx` | 512 | 1 | 48 | 4 | 12 | category editing, section editing, slug issue display, sort behavior propagation | 🟠 HIGH |

`DevModePage.tsx` now delegates changelog state/rendering to `useDevModeChangeLog.ts` and `DevModeChangeLogTab.tsx`, and about/profile/tag prop shaping to `useDevModeSupportTabProps.ts`. It still owns too many article-editor and save-flow responsibilities, but the tab-specific seams are now explicit and independently testable.

`SubstanceEditorTab.tsx` is now down to the tab shell plus API-key/model controls and section layout. Source aggregation moved to `useSubstanceEditorSourceData.ts`, draft/save orchestration moved to `useSubstanceEditorDraftController.ts`, and article matching/upsert rules moved to `substanceEditorDraftUtils.ts`.

`useSectionGeneration.ts` now delegates prompt construction, section-content detection, token estimation, and adaptive reasoning policy to `sectionGenerationUtils.ts`. The remaining hook body is still stateful and async-heavy, but its policy surface is now explicit and reusable.

`IndexLayoutTab.tsx` has now been reduced to the tab shell and dataset/save wiring. The drag/drop and category manipulation logic lives in `useIndexLayoutCategoryController.ts`, and the next remaining index-layout hotspot is `CategoryEditor.tsx`.

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
2. `src/features/dev/tools/index-layout/CategoryEditor.tsx:1` is now the dominant remaining editor-specific hotspot after the `SubstanceEditorTab` split. Nested category and section editing logic is still concentrated in one component.
3. `src/features/dev/tools/index-layout/CategoryEditor.tsx:1` is now the dominant remaining index-layout hotspot after the tab shell split. Further cleanup should target the nested category and section editing UI.

### 🟠 HIGH (P1) — Significant technical debt

1. `src/features/dev/tools/substance-editor/useSectionGeneration.ts:78` still contains a large async orchestration path with retries and fallback behavior in one hook, even after the pure reasoning policy and prompt-building helpers were extracted.
2. `src/features/dev/tools/substance-editor/yamlParser.ts:1` has grown into a multi-responsibility normalization layer for generated YAML, legacy article shapes, and validation repair.
3. `src/features/article/components/sections/HistoryCultureSection.tsx:1` carries too many presentation variants and formatting concerns in a single file.
4. `src/features/dev/tools/index-layout/useIndexLayoutCategoryController.ts:30` centralizes drag/drop and category mutations into one hook. That is a better boundary than the original monolithic tab, but it is still a dense control surface.

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
| Files >500 LOC | 8 | 0 | ❌ |
| God objects | 6 strict candidates | 0 | ❌ |
| Circular deps | 0 direct cycles found | 0 | ✅ |
| DRY violations | 0 high-signal duplicates logged | 0 | ✅ |
| Dead code blocks | Not fully audited yet | 0 | ❌ |
