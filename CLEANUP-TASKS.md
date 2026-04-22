# Refactoring Task Tracker
> **Last updated**: 2026-04-22 13:41 MDT | **Updated by**: AI Agent
> **Status**: Complete | ✅ 14/14 tasks complete (100%)

## Legend
- Priority: 🔴 P0 | 🟠 P1 | 🟡 P2 | 🔵 P3
- Status: ⬜ TODO | 🔄 IN_PROGRESS | ✅ DONE | 🚫 BLOCKED
- Effort: S (<1hr) | M (1-4hrs) | L (4-8hrs) | XL (multi-day)

---

## Progress Dashboard

| Phase | Total | ✅ | 🔄 | ⬜ | 🚫 | Progress |
|-------|-------|----|----|----|-----|----------|
| Phase 0: Safety Net | 3 | 3 | 0 | 0 | 0 | ████████ 100% |
| Phase 1: Quick Wins | 3 | 3 | 0 | 0 | 0 | ████████ 100% |
| Phase 2: Decomposition | 5 | 5 | 0 | 0 | 0 | ████████ 100% |
| Phase 3: Architecture | 3 | 3 | 0 | 0 | 0 | ████████ 100% |
| **Total** | **14** | **14** | **0** | **0** | **0** | **████████ 100%** |

---

## Phase 0: Safety Net
> Goal: Add focused coverage around the next high-risk extractions before changing behavior.

### TASK-001 | 🔴 P0 | ✅ DONE | Effort: M
**Add characterization coverage for `scripts/batch/batch-generate-summary.mjs`**
- **File**: `scripts/batch/batch-generate-summary.mjs`
- **Why**: This is the highest-value tooling split, but it currently mixes CLI flow, Convex access, and content validation in one file.
- **Depends on**: —
- **Subtasks**:
  - [x] Lock current CLI option parsing and target-deployment behavior
  - [x] Capture prompt/source selection precedence with fixtures
  - [x] Cover validation and no-op-save behavior
  - [x] Run targeted tests
  - [x] **Update this tracker**

### TASK-002 | 🔴 P0 | ✅ DONE | Effort: M
**Add fixture-based parser contract tests for the parser family**
- **Files**: `scripts/parsers/base.ts`, `scripts/parsers/others.ts`, `scripts/parsers/erowid.ts`, `scripts/parsers/psychonautwiki.ts`, `scripts/parsers/tripsit.ts`
- **Why**: Parser refactors are risky without stable fixtures proving the normalized output contract.
- **Depends on**: —
- **Subtasks**:
  - [x] Define representative parser fixtures per source
  - [x] Assert normalized output shape and key transforms
  - [x] Cover failure/empty-input behavior
  - [x] Run targeted tests
  - [x] **Update this tracker**

### TASK-003 | 🟠 P1 | ✅ DONE | Effort: S
**Expand rendering tests around the large article section components**
- **Files**: `src/features/article/components/sections/HistoryCultureSection.tsx`, `src/features/article/components/sections/SubjectiveEffectsSection.tsx`, `src/features/article/components/sections/DosageDurationSection.tsx`
- **Why**: These are the next runtime decomposition candidates and need behavior coverage before layout extraction.
- **Depends on**: —
- **Subtasks**:
  - [x] Cover collapse/expand behavior
  - [x] Cover route/effect selection edge cases
  - [x] Cover heading/icon fallback behavior
  - [x] Run targeted tests
  - [x] **Update this tracker**

---

## Phase 1: Quick Wins
> Goal: Remove low-risk coupling and extract obvious static/config-heavy seams.

### TASK-004 | 🔵 P3 | ✅ DONE | Effort: S
**Remove the type-only cycle in section generation**
- **Files**: `src/features/dev/tools/substance-editor/useSectionGeneration.ts`, `src/features/dev/tools/substance-editor/sectionGenerationUtils.ts`
- **Why**: The cycle is low-risk today but easy to eliminate by moving shared types into a narrow `types.ts`.
- **Depends on**: —
- **Subtasks**:
  - [x] Move `GenerationMode` and `ReasoningMode` to a shared type module
  - [x] Update imports without changing behavior
  - [x] Run targeted tests and `npm run typecheck`
  - [x] **Update this tracker**

### TASK-005 | 🟡 P2 | ✅ DONE | Effort: S
**Extract static registries/config maps from oversized UI files**
- **Files**: `src/features/article/components/sections/HistoryCultureSection.tsx`, `src/features/effects/pages/EffectsIndexPage.tsx`
- **Why**: Both files are inflated by large static metadata collections that should live outside the renderer.
- **Depends on**: TASK-003
- **Subtasks**:
  - [x] Move heading/icon taxonomy into a focused config module
  - [x] Move effect tab/category config into focused data modules
  - [x] Keep component APIs unchanged
  - [x] Run targeted tests and typecheck
  - [x] **Update this tracker**

### TASK-006 | 🟠 P1 | ✅ DONE | Effort: M
**Split `lib/convex/publicData.ts` by domain**
- **File**: `lib/convex/publicData.ts`
- **Why**: Public read-model shaping for substances, effects, reports, about data, and layouts should not keep accumulating inside one server helper.
- **Depends on**: —
- **Subtasks**:
  - [x] Extract shared normalization helpers
  - [x] Create domain read modules for substances/effects/reports/about
  - [x] Leave the public API stable or provide a compatibility facade
  - [x] Run tests and `npm run typecheck`
  - [x] **Update this tracker**

---

## Phase 2: Decomposition
> Goal: Break the current hotspot files into smaller, testable modules.

### TASK-007 | 🔴 P0 | ✅ DONE | Effort: XL
**Decompose `scripts/batch/batch-generate-summary.mjs` into a reusable batch pipeline**
- **Source file**: `scripts/batch/batch-generate-summary.mjs`
- **Target files**: focused modules under `scripts/batch/summary/` or a shared batch utility layer
- **Why**: This is the highest-leverage cleanup task in the repo because it also creates a pattern for the rest of `scripts/batch/`.
- **Depends on**: TASK-001
- **Subtasks**:
  - [x] Extract CLI/options parsing
  - [x] Extract prompt/source selection
  - [x] Extract validation/diff and writeback/reporting
  - [x] Keep the script entrypoint behavior stable
  - [x] Run targeted tests
  - [x] **Update this tracker**

### TASK-008 | 🟠 P1 | ✅ DONE | Effort: L
**Split `src/data/builders/libraryBuilder.ts` into coordinator plus domain builders**
- **Source file**: `src/data/builders/libraryBuilder.ts`
- **Why**: Category presentation, effect detail assembly, and mechanism lookup construction should not keep living behind one build function.
- **Depends on**: —
- **Subtasks**:
  - [x] Extract category-system assembly
  - [x] Extract effect-detail lookup builders
  - [x] Extract mechanism-detail lookup builders
  - [x] Leave `buildLibrary` as a thin coordinator
  - [x] Run existing builder tests and typecheck
  - [x] **Update this tracker**

### TASK-009 | 🟠 P1 | ✅ DONE | Effort: L
**Decompose the large article section renderers**
- **Source files**: `src/features/article/components/sections/HistoryCultureSection.tsx`, `src/features/article/components/sections/SubjectiveEffectsSection.tsx`, `src/features/article/components/sections/DosageDurationSection.tsx`
- **Why**: These files remain the main runtime UI maintainability hotspot after the earlier `/dev` cleanup wave.
- **Depends on**: TASK-003, TASK-005
- **Subtasks**:
  - [x] Extract shared formatting/truncation helpers
  - [x] Extract reusable subcomponents for badges, groups, and timeline blocks
  - [x] Isolate DXM plateau-specific rendering from the generic dosage route presenter
  - [x] Run targeted tests and typecheck
  - [x] **Update this tracker**

### TASK-010 | 🟡 P2 | ✅ DONE | Effort: M
**Split `src/utils/data/tagRegistry.ts` into registry-read and mutation-write layers**
- **Source file**: `src/utils/data/tagRegistry.ts`
- **Why**: The file still does too much article scanning and rewrite planning in one module.
- **Depends on**: —
- **Subtasks**:
  - [x] Extract immutable article/tag read helpers
  - [x] Extract mutation planning and rewrite application helpers
  - [x] Keep the existing public API stable for callers
  - [x] Run targeted tests and typecheck
  - [x] **Update this tracker**

### TASK-011 | 🟠 P1 | ✅ DONE | Effort: M
**Split `convex/contributorProfiles.ts` into validators, ownership rules, and endpoint handlers**
- **Source file**: `convex/contributorProfiles.ts`
- **Why**: The current Convex module is accumulating schema validation, normalization, authorization, storage resolution, and query/mutation orchestration.
- **Depends on**: —
- **Subtasks**:
  - [x] Extract sanitization and normalization helpers
  - [x] Extract ownership/authorization rules
  - [x] Leave a thin query/mutation surface in the Convex module
  - [x] Run tests and `npm run typecheck`
  - [x] **Update this tracker**

---

## Phase 3: Architecture Improvements
> Goal: Create reusable patterns so the same hotspots do not reappear.

### TASK-012 | 🔴 P0 | ✅ DONE | Effort: XL
**Introduce a shared framework for `scripts/batch/` generators**
- **Files**: `scripts/batch/*.mjs`
- **Why**: The batch generator family repeats env/bootstrap, Convex access, prompt routing, logging, and result reporting across multiple scripts.
- **Depends on**: TASK-007
- **Subtasks**:
  - [x] Design a shared batch runner abstraction
  - [x] Migrate at least one additional generator onto the shared runner
  - [x] Verify CLI compatibility for existing workflows
  - [x] **Update this tracker**

### TASK-013 | 🟠 P1 | ✅ DONE | Effort: L
**Normalize the parser family around a clearer contract boundary**
- **Files**: `scripts/parsers/base.ts`, `scripts/parsers/others.ts`, source-specific parser modules
- **Why**: The current parser layer makes it too easy for source-specific logic to leak into shared abstractions and vice versa.
- **Depends on**: TASK-002
- **Subtasks**:
  - [x] Define the shared parser contract explicitly
  - [x] Split source registries from shared transforms
  - [x] Move source-specific heuristics into smaller modules
  - [x] **Update this tracker**

### TASK-014 | 🟠 P1 | ✅ DONE | Effort: L
**Reduce `/dev` save-pipeline coupling**
- **Files**: `src/features/dev/pages/useDevModeSaveActions.tsx`, adjacent commit/save components
- **Why**: The earlier `/dev` decomposition moved the largest page-level hub, but save workflow orchestration is now the next coupling center.
- **Depends on**: —
- **Subtasks**:
  - [x] Separate save orchestration from commit-panel presentation
  - [x] Isolate notice timing and credential state
  - [x] Keep editor behavior and route guards unchanged
  - [x] Run tests and `npm run typecheck`
  - [x] **Update this tracker**

---

## Notes

- Generated/config-heavy files such as `src/data/schema/fieldRegistry.generated.ts` should remain out of the manual refactor critical path unless the generator strategy itself is being changed.
- The current cleanup backlog is complete. Future passes should focus on new hotspots that emerge rather than reopening the original task list.
- The shared `scripts/batch/` runner now covers the common generator shell used by `summary` and `harm-potential`, giving the remaining batch scripts a clear migration target.
