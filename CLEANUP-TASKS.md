# Refactoring Task Tracker
> **Last updated**: 2026-04-09 17:30 MDT | **Updated by**: AI Agent
> **Status**: Phase 5 | ✅ 11/11 tasks complete (100%)

## Legend
- Priority: 🔴 P0 | 🟠 P1 | 🟡 P2 | 🔵 P3
- Status: ⬜ TODO | 🔄 IN_PROGRESS | ✅ DONE | 🚫 BLOCKED
- Effort: S (<1hr) | M (1-4hrs) | L (4-8hrs) | XL (multi-day)

---

## Progress Dashboard

| Phase | Total | ✅ | 🔄 | ⬜ | 🚫 | Progress |
|-------|-------|----|----|----|-----|----------|
| Phase 0: Safety Net | 2 | 2 | 0 | 0 | 0 | ████████ 100% |
| Phase 1: Quick Wins | 3 | 3 | 0 | 0 | 0 | ████████ 100% |
| Phase 2: Decomposition | 4 | 4 | 0 | 0 | 0 | ████████ 100% |
| Phase 3: Architecture | 2 | 2 | 0 | 0 | 0 | ████████ 100% |
| **Total** | **11** | **11** | **0** | **0** | **0** | **████████ 100%** |

---

## Phase 0: Safety Net
> Goal: Establish test coverage on critical paths before making cleanup edits.

### TASK-001 | 🔴 P0 | ✅ DONE | Effort: S
**Add characterization tests for save-to-convex helper behavior**
- **File**: `src/app/api/save-to-convex/route.ts`
- **Why**: The route mixes parsing, article targeting, verification planning, and revalidation path generation. Extraction is unsafe without preserving current behavior first.
- **Depends on**: —
- **Subtasks**:
  - [x] Cover `parseAboutPayload`
  - [x] Cover `parseChangelogPayload`
  - [x] Cover article targeting and fallback slug logic
  - [x] Cover article revalidation path assembly
  - [x] Run targeted tests
  - [x] **Update this tracker**

### TASK-002 | 🟠 P1 | ✅ DONE | Effort: M
**Add behavior tests for `GlobalSearch` suggestion loading and close/open state**
- **File**: `src/components/common/GlobalSearch.tsx`
- **Why**: The component mixes async suggestion loading, navigation, and keyboard behavior. Any extraction should preserve current interaction semantics.
- **Depends on**: —
- **Subtasks**:
  - [x] Mock `/api/search-suggestions`
  - [x] Cover active-search open/close behavior
  - [x] Cover cached suggestion reuse
  - [x] Cover search submit navigation
  - [x] Run targeted tests
  - [x] **Update this tracker**

---

## Phase 1: Quick Wins
> Goal: Low-risk improvements that reduce coupling and file size in safe areas.

### TASK-003 | 🔴 P0 | ✅ DONE | Effort: S
**Extract save-to-convex route helpers into a focused module**
- **Source file**: `src/app/api/save-to-convex/route.ts` (396 LOC)
- **Target file**: `src/app/api/save-to-convex/saveToConvexUtils.ts`
- **Methods to move**: parsing, slug/summary helpers, verification planning, revalidation path building
- **Depends on**: TASK-001
- **Risk**: Low — pure/helper extraction with characterization tests
- **Subtasks**:
  - [x] Create helper module
  - [x] Move pure parsing and article-summary helpers
  - [x] Move revalidation path builder
  - [x] Keep route API unchanged
  - [x] Run targeted tests
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert the helper extraction commit

### TASK-004 | 🔴 P0 | ✅ DONE | Effort: S
**Break the active dev-editor barrel import cycle**
- **Source file**: `src/hooks/useDevTagOptions.ts`
- **Target file**: direct import from `src/features/dev/context/DevModeContext.tsx`
- **Depends on**: —
- **Risk**: Low — import-only change
- **Subtasks**:
  - [x] Replace barrel import with direct context import
  - [x] Verify cycle is removed
  - [x] Run targeted type/lint checks
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert the cycle-break commit

### TASK-005 | 🟡 P2 | ✅ DONE | Effort: S
**Deduplicate small text helpers used by About/editor surfaces**
- **Source files**: `src/components/pages/AboutPage.tsx`, `src/features/dev/tools/about/AboutEditorTab.tsx`, `src/features/dev/tools/substance-editor/types.ts`
- **Target file**: new shared utility under `src/features/dev/tools/about/` or `src/lib/`
- **Depends on**: —
- **Risk**: Low — pure helper consolidation
- **Subtasks**:
  - [x] Extract shared `toInitials`
  - [x] Extract shared `normalizeWhitespace`
  - [x] Replace local duplicates
  - [x] Run targeted tests or typecheck for touched files
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert helper consolidation commit

---

## Phase 2: Decomposition
> Goal: Break god objects into focused, single-responsibility modules.

### TASK-006 | 🔴 P0 | ✅ DONE | Effort: XL
**Decompose `DevModePage` into page shell + save-flow + changelog modules**
- **Source file**: `src/features/dev/pages/DevModePage.tsx` (2447 LOC)
- **Target files**: new modules under `src/features/dev/pages/` or adjacent feature folders
- **Methods to move**: save handlers, changelog filtering/derivation, commit panel composition, tab-specific selectors
- **Depends on**: Current user edits in this file should settle before execution
- **Risk**: High — currently a dirty worktree file with active local edits
- **Subtasks**:
  - [x] Add characterization tests around save and changelog flows
  - [x] Extract save-flow controller(s)
  - [x] Extract changelog derivation utilities
  - [x] Extract commit panel/presentation fragments
  - [x] Run full test suite
  - [x] Verify no behavior regressions in `/dev`
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before decomposition

### TASK-007 | 🔴 P0 | ✅ DONE | Effort: L
**Split `SubstanceEditorTab` into orchestration and presentational modules**
- **Source file**: `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx` (932 LOC)
- **Target files**: new modules under `src/features/dev/tools/substance-editor/`
- **Methods to move**: modal state management, preview/source/prompt wiring, tab layout composition
- **Depends on**: Current user edits in this file should settle before execution
- **Risk**: High — currently a dirty worktree file with active local edits
- **Subtasks**:
  - [x] Add characterization tests for tab interactions
  - [x] Extract modal state hooks
  - [x] Extract preview/prompt/source composition blocks
  - [x] Run targeted tests
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before extraction

### TASK-008 | 🔴 P0 | ✅ DONE | Effort: L
**Extract a generation engine from `SectionGenerator`**
- **Source file**: `src/features/dev/tools/substance-editor/SectionGenerator.tsx` (793 LOC)
- **Target file**: `src/features/dev/tools/substance-editor/useSectionGeneration.ts` or equivalent
- **Methods to move**: prompt assembly, logging, pass orchestration, fallback logic, response normalization
- **Depends on**: TASK-007 or equivalent tab-level stabilization
- **Risk**: Medium — heavily stateful async flow
- **Subtasks**:
  - [x] Add characterization tests for generate success/fallback/error paths
  - [x] Extract generation hook/service
  - [x] Leave visual component focused on rendering controls
  - [x] Run targeted tests
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before extraction

### TASK-009 | 🟠 P1 | ✅ DONE | Effort: L
**Split `ContentFieldsRHF` by domain section**
- **Source file**: `src/features/dev/forms/ContentFieldsRHF.tsx` (808 LOC)
- **Target files**: domain-focused form section components under `src/features/dev/forms/`
- **Methods to move**: interactions, tolerance, notes, addiction-related subsections
- **Depends on**: —
- **Risk**: Medium — large form surface but mostly compositional logic
- **Subtasks**:
  - [x] Add characterization tests for the current rendered sections
  - [x] Extract domain section components
  - [x] Keep section API stable for callers
  - [x] Run targeted tests
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before split

---

## Phase 3: Architecture Improvements
> Goal: Reduce coupling and improve module cohesion.

### TASK-010 | 🟠 P1 | ✅ DONE | Effort: L
**Split `DevModeContext` into smaller state slices**
- **Source file**: `src/features/dev/context/DevModeContext.tsx` (472 LOC)
- **Depends on**: TASK-006 planning clarity
- **Risk**: Medium — touches shared editor state contracts
- **Subtasks**:
  - [x] Identify article, layout, about, and navigation state seams
  - [x] Extract focused providers or reducer slices
  - [x] Keep `useDevMode` consumption stable or provide a facade
  - [x] Run targeted tests and typecheck
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before provider split

### TASK-011 | 🟡 P2 | ✅ DONE | Effort: L
**Stage `libraryBuilder` and `contentBuilder` into smaller pure pipeline modules**
- **Source files**: `src/data/builders/libraryBuilder.ts`, `src/data/builders/contentBuilder.ts`
- **Depends on**: —
- **Risk**: Medium — broad read surface
- **Subtasks**:
  - [x] Identify shared transformation stages
  - [x] Extract pure builders with narrow inputs/outputs
  - [x] Keep public builder APIs stable
  - [x] Run builder tests and typecheck
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before builder extraction

---

## Completed Tasks Log
| Task | Completed | Before Metrics | After Metrics |
|------|-----------|---------------|--------------|
| TASK-001 | 2026-04-09 17:04 MDT | 0 targeted tests for save-to-convex helper behavior | 5 passing tests covering payload parsing, article targeting, submitted-by derivation, and revalidation path assembly |
| TASK-002 | 2026-04-09 17:09 MDT | 0 interaction tests for `GlobalSearch` | 4 passing tests covering suggestion open/close behavior, cache reuse, submit navigation, and option selection |
| TASK-003 | 2026-04-09 17:14 MDT | `route.ts` at 396 LOC with duplicated parsing/summary/path logic and no shared helper module | `route.ts` reduced to 251 LOC, helper logic moved into `saveToConvexUtils.ts` (167 LOC), 6 passing helper tests preserved |
| TASK-004 | 2026-04-09 17:20 MDT | 1 confirmed active-app import cycle through `@/features/dev` barrel usage | 0 confirmed active-app import cycles after direct context import; `npm run typecheck` passed |
| TASK-005 | 2026-04-09 17:26 MDT | 2 duplicated helper implementations across About/editor files | shared helpers moved to `src/lib/text.ts`; 3 helper tests added and `npm run typecheck` passed |
| TASK-006 | 2026-04-09 17:35 MDT | `DevModePage.tsx` at 2447 LOC with embedded changelog/save derivation and inline commit-panel rendering | `DevModePage.tsx` reduced to 2313 LOC; extracted `devModePageUtils.ts` and `DevModeCommitPanel.tsx`; full suite passed (108 tests) and `npm run build` succeeded |
| TASK-007 | 2026-04-09 16:59 MDT | `SubstanceEditorTab.tsx` at 932 LOC with inline source-preview state, source modal rendering, and output/source composition blocks | `SubstanceEditorTab.tsx` reduced to 874 LOC; extracted `useSourcePreviewState.ts`, `SubstanceEditorOutputSection.tsx`, and `SubstanceEditorSourcesSection.tsx`; targeted characterization test and `npm run typecheck` passed |
| TASK-008 | 2026-04-09 17:06 MDT | `SectionGenerator.tsx` at 793 LOC with prompt assembly, reasoning policy, streaming orchestration, fallback retry, and apply/discard state embedded in the UI component | `SectionGenerator.tsx` reduced to 390 LOC; runtime extracted to `useSectionGeneration.ts`; targeted tests now cover success, adaptive downgrade, retry-without-reasoning, and thrown-error paths |
| TASK-009 | 2026-04-09 17:12 MDT | `ContentFieldsRHF.tsx` at 808 LOC with harm potential, interactions, tolerance, notes, and shared editor widgets combined in one file | `ContentFieldsRHF.tsx` reduced to a 12-line barrel; domain modules split into four focused files plus `contentFieldsShared.tsx`; 4 barrel-compatibility tests and `npm run typecheck` passed |
| TASK-010 | 2026-04-09 17:19 MDT | `DevModeContext.tsx` at 472 LOC with article, index-layout, about, prompt, and navigation state combined in one provider | `DevModeContext.tsx` reduced to 100 LOC; state split into six focused context hooks/helpers; targeted provider tests and `npm run typecheck` passed |
| TASK-011 | 2026-04-09 17:30 MDT | `contentBuilder.ts` and `libraryBuilder.ts` at 748 LOC and 943 LOC respectively, with route parsing, interaction indexing, and taxonomy transforms embedded in the core builders | extracted staged pure helpers into `contentBuilderShared.ts`, `contentBuilderRoutes.ts`, `contentBuilderInteractions.ts`, `libraryBuilderInteractions.ts`, and `libraryBuilderTaxonomy.ts`; `contentBuilder.ts` reduced to 451 LOC and `libraryBuilder.ts` to 677 LOC; builder tests and `npm run typecheck` passed |
