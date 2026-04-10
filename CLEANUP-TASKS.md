# Refactoring Task Tracker
> **Last updated**: 2026-04-10 16:22 MDT | **Updated by**: AI Agent
> **Status**: Phase 5 | ✅ 12/12 tasks complete (100%)

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
| Phase 2: Decomposition | 5 | 5 | 0 | 0 | 0 | ████████ 100% |
| Phase 3: Architecture | 2 | 2 | 0 | 0 | 0 | ████████ 100% |
| **Total** | **12** | **12** | **0** | **0** | **0** | **██████████ 100%** |

---

## Phase 0: Safety Net
> Goal: Add narrow tests around the next planned extractions before moving logic.

### TASK-001 | 🔴 P0 | ✅ DONE | Effort: S
**Add characterization tests for `IndexLayoutTab` sorting and slug-status helpers**
- **File**: `src/features/dev/tools/index-layout/IndexLayoutTab.tsx`
- **Why**: The first safe extraction is the dataset sort/status logic; tests should lock current psychoactive-vs-non-psychoactive behavior before moving it.
- **Depends on**: —
- **Subtasks**:
  - [x] Cover common-tag prioritization for psychoactive datasets
  - [x] Cover alphabetical sorting for non-psychoactive datasets
  - [x] Cover `resolveSlugStatus` missing/hidden/duplicate behavior
  - [x] Run targeted tests
  - [x] **Update this tracker**

### TASK-002 | 🟠 P1 | ✅ DONE | Effort: S
**Add route-state tests before touching `NextDevRouteClient`**
- **File**: `src/app/dev/_components/NextDevRouteClient.tsx`
- **Why**: The app-shell `/dev` route client is a likely quick-win cleanup target after the barrel import fix.
- **Depends on**: —
- **Subtasks**:
  - [x] Cover `resolveDevRouteState`
  - [x] Cover fallback behavior for non-dev routes
  - [x] Run targeted tests
  - [x] **Update this tracker**

---

## Phase 1: Quick Wins
> Goal: Low-risk extractions and coupling reductions.

### TASK-003 | 🔴 P0 | ✅ DONE | Effort: M
**Extract `IndexLayoutTab` dataset sorting and slug-status logic into a pure helper module**
- **Source file**: `src/features/dev/tools/index-layout/IndexLayoutTab.tsx` (732 LOC)
- **Target file**: `src/features/dev/tools/index-layout/layoutDataUtils.ts`
- **Methods to move**: common-tag sorting, dataset sort selection, section sorting, slug-status resolution, manual ordering helpers
- **Depends on**: TASK-001
- **Risk**: Low — pure/helper extraction with focused tests
- **Subtasks**:
  - [x] Create helper module
  - [x] Move pure sort/status/manual-ordering logic
  - [x] Keep `IndexLayoutTab` behavior unchanged
  - [x] Run targeted tests and `npm run typecheck`
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert the helper extraction commit

### TASK-004 | 🟡 P2 | ✅ DONE | Effort: S
**Break the `@/features/dev` barrel import in `NextDevRouteClient`**
- **Source file**: `src/app/dev/_components/NextDevRouteClient.tsx`
- **Depends on**: —
- **Risk**: Low — import-only change
- **Subtasks**:
  - [x] Replace barrel import with direct module imports
  - [x] Run targeted typecheck
  - [x] Update `CLEANUP-AUDIT.md` dependency notes
  - [x] **Update this tracker**
- **Rollback**: revert the import change

### TASK-005 | 🟡 P2 | ✅ DONE | Effort: S
**Deduplicate About-editor placeholder and textarea sizing helpers**
- **Source file**: `src/features/dev/tools/about/AboutEditorTab.tsx`
- **Depends on**: —
- **Risk**: Low — pure helper consolidation inside one feature
- **Subtasks**:
  - [x] Extract placeholder-resolution helper
  - [x] Extract textarea auto-resize helper
  - [x] Run targeted typecheck
  - [x] Update `CLEANUP-AUDIT.md` DRY notes
  - [x] **Update this tracker**
- **Rollback**: revert the helper consolidation commit

---

## Phase 2: Decomposition
> Goal: Break the next tier of oversized files into narrower modules.

### TASK-006 | 🔴 P0 | ✅ DONE | Effort: L
**Split `IndexLayoutTab` into controller logic and render sections**
- **Source file**: `src/features/dev/tools/index-layout/IndexLayoutTab.tsx`
- **Target files**: focused modules under `src/features/dev/tools/index-layout/`
- **Depends on**: TASK-003
- **Risk**: Medium — stateful drag/drop flow
- **Subtasks**:
  - [x] Extract column/group derivation and drag handlers
  - [x] Extract JSON-editor vs layout-view presentation
  - [x] Run targeted tests and typecheck
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before split

### TASK-007 | 🟠 P1 | ✅ DONE | Effort: L
**Break `AboutEditorTab` into editor, preview, and founder-selection modules**
- **Source file**: `src/features/dev/tools/about/AboutEditorTab.tsx`
- **Depends on**: TASK-005
- **Risk**: Medium — mostly render decomposition
- **Subtasks**:
  - [x] Extract preview card
  - [x] Extract founder selector/pill list
  - [x] Extract editor controls
  - [x] Run targeted tests or typecheck
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before split

### TASK-008 | 🟠 P1 | ✅ DONE | Effort: L
**Split `TagMultiSelect` into state/controller and presentation pieces**
- **Source file**: `src/components/common/TagMultiSelect.tsx`
- **Depends on**: —
- **Risk**: Medium — keyboard interaction-heavy component
- **Subtasks**:
  - [x] Add characterization tests for selection/filtering if coverage is missing
  - [x] Extract selection state and filtering helpers
  - [x] Keep caller API stable
  - [x] Run targeted tests
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before split

### TASK-011 | 🟠 P1 | ✅ DONE | Effort: M
**Decompose `yamlParser.ts` into focused parser and normalization modules**
- **Source file**: `src/features/dev/tools/substance-editor/yamlParser.ts`
- **Target files**: focused modules under `src/features/dev/tools/substance-editor/`
- **Depends on**: —
- **Risk**: Medium — legacy YAML repair logic touches multiple article sections
- **Subtasks**:
  - [x] Add characterization tests for legacy normalization paths
  - [x] Extract shared coercion/effect helpers
  - [x] Extract harm-potential normalization
  - [x] Keep `parseGeneratedYaml` and `normalizeArticleInput` API stable
  - [x] Run targeted tests and `npm run typecheck`
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before decomposition

### TASK-012 | 🟠 P1 | ✅ DONE | Effort: M
**Decompose `CategoryEditor.tsx` into focused category-editor helpers**
- **Source file**: `src/features/dev/tools/index-layout/CategoryEditor.tsx`
- **Target files**: focused modules under `src/features/dev/tools/index-layout/`
- **Depends on**: TASK-006
- **Risk**: Medium — category and section mutations are tightly coupled to the editor surface
- **Subtasks**:
  - [x] Extract pure category-editor derivation/update helpers
  - [x] Extract the category details panel from the main component
  - [x] Add targeted tests for the new helper layer
  - [x] Run targeted tests, lint, and typecheck
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before the category-editor split

---

## Phase 3: Architecture Improvements
> Goal: Reduce the remaining coupling hubs.

### TASK-009 | 🔴 P0 | ✅ DONE | Effort: XL
**Continue decomposing `DevModePage` behind tab-level controllers/facades**
- **Source file**: `src/features/dev/pages/DevModePage.tsx`
- **Depends on**: TASK-003, TASK-006
- **Risk**: High — central `/dev` workflow hub
- **Subtasks**:
  - [x] Extract changelog controller
  - [x] Extract about/profile/tag editor orchestration
  - [x] Preserve current tab API for `NextDevRouteClient`
  - [x] Run full test suite and typecheck
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before decomposition

### TASK-010 | 🔴 P0 | ✅ DONE | Effort: XL
**Continue splitting `SubstanceEditorTab` and generation flow**
- **Source files**: `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx`, `src/features/dev/tools/substance-editor/useSectionGeneration.ts`
- **Depends on**: TASK-009 sequencing clarity
- **Risk**: High — async generation and save flow
- **Subtasks**:
  - [x] Extract source aggregation and save orchestration
  - [x] Shrink generation hook responsibilities
  - [x] Run targeted tests and typecheck
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: revert to commit before split

---

## Completed Tasks Log
| Task | Completed | Before Metrics | After Metrics |
| TASK-001 | 2026-04-09 18:15 MDT | No focused coverage for `IndexLayoutTab` dataset sort and slug-status behavior | Added `layoutDataUtils.test.ts` with 4 passing tests covering psychoactive common-priority sorting, non-psychoactive alphabetical sorting, slug issue resolution, and manual ordering behavior; `npm run typecheck` passed |
| TASK-002 | 2026-04-09 18:21 MDT | No focused coverage for `NextDevRouteClient` route-state fallback behavior | Added `NextDevRouteClient.test.ts` with 4 passing tests for dev-tab alias parsing, null-path fallback, non-dev fallback, and unknown-tab normalization; `npm run typecheck` passed |
| TASK-003 | 2026-04-09 18:17 MDT | `IndexLayoutTab.tsx` at 732 LOC with inline dataset sorting, slug-status resolution, and manual-ordering callbacks | Extracted tested pure logic to `layoutDataUtils.ts`; `IndexLayoutTab.tsx` reduced to 653 LOC; targeted tests and `npm run typecheck` passed |
| TASK-004 | 2026-04-09 18:20 MDT | `NextDevRouteClient.tsx` imported `DevModeProvider` and `DevModePage` via the `@/features/dev` barrel | Replaced the barrel import with direct module imports, confirmed no remaining `@/features/dev` app-shell imports, and `npm run typecheck` passed |
| TASK-005 | 2026-04-09 18:24 MDT | `AboutEditorTab.tsx` duplicated placeholder replacement and textarea auto-size logic inline | Extracted `aboutEditorUtils.ts` for placeholder resolution and textarea sizing; `npm run typecheck` passed and the tracked DRY finding was removed from the audit |
| TASK-006 | 2026-04-09 18:27 MDT | `IndexLayoutTab.tsx` at 653 LOC with category controller logic and JSON/layout rendering branches still inline | Split the tab into `useIndexLayoutCategoryController.ts`, `IndexLayoutJsonEditor.tsx`, and `IndexLayoutColumns.tsx`; `IndexLayoutTab.tsx` reduced to 326 LOC; targeted index-layout tests and `npm run typecheck` passed |
| TASK-007 | 2026-04-09 18:31 MDT | `AboutEditorTab.tsx` at 494 LOC with source editors, live preview, and founder-selection UI all inline | Split the tab into `AboutCopyEditors.tsx`, `AboutPreviewSection.tsx`, and `AboutFounderSelectionSection.tsx`; `AboutEditorTab.tsx` reduced to 219 LOC and `npm run typecheck` passed |
| TASK-008 | 2026-04-09 18:42 MDT | `TagMultiSelect.tsx` at 531 LOC with filtering, creation, keyboard interaction, menu rendering, and selected-tag rendering all inline and untested | Added `TagMultiSelect.test.tsx` with 3 passing tests, extracted `useTagMultiSelectState.ts`, `TagMultiSelectMenu.tsx`, `TagMultiSelectSelectedTags.tsx`, and `tagMultiSelectUtils.ts`; `TagMultiSelect.tsx` reduced to 162 LOC and `npm run typecheck` passed |
| TASK-009 | 2026-04-09 18:54 MDT | `DevModePage.tsx` at 2624 LOC with changelog filters/rendering and about/profile/tag prop wiring kept inline with the `/dev` shell | Extracted `useDevModeChangeLog.ts`, `DevModeChangeLogTab.tsx`, and `useDevModeSupportTabProps.ts`; `DevModePage.tsx` reduced to 2009 LOC while preserving child tab APIs; full `npm run test` and `npm run typecheck -- --pretty false` passed |
| TASK-010 | 2026-04-09 19:04 MDT | `SubstanceEditorTab.tsx` at 874 LOC with source aggregation, draft/save orchestration, and section-editor wiring inline; `useSectionGeneration.ts` at 671 LOC mixing pure reasoning policy with async execution | Extracted `useSubstanceEditorSourceData.ts`, `useSubstanceEditorDraftController.ts`, `substanceEditorDraftUtils.ts`, and `sectionGenerationUtils.ts`; `SubstanceEditorTab.tsx` reduced to 499 LOC and `useSectionGeneration.ts` reduced to 486 LOC; targeted substance-editor tests and `npm run typecheck -- --pretty false` passed |
| TASK-011 | 2026-04-10 10:36 MDT | `yamlParser.ts` at 706 LOC with parsing, shared coercion helpers, section normalization, and harm-potential legacy repair all concentrated in one file | Added characterization coverage for subjective-effects and harm-potential legacy shapes, extracted `yamlParserShared.ts`, `yamlParserSectionNormalizers.ts`, and `yamlParserHarmPotential.ts`, and reduced `yamlParser.ts` to a 135 LOC parse facade; targeted parser tests and `npm run typecheck` passed |
| TASK-012 | 2026-04-10 16:22 MDT | `CategoryEditor.tsx` at 548 LOC with category field handlers, immutable section mutations, slug-derivation helpers, and details-panel rendering all concentrated in one file | Extracted `categoryEditorUtils.ts`, `CategoryEditorDetailsPanel.tsx`, and `categoryEditorUtils.test.ts`; reduced `CategoryEditor.tsx` to 441 LOC, reused the new column helper in `useIndexLayoutCategoryController.ts`, and passed targeted tests, ESLint, and `npm run typecheck` |
