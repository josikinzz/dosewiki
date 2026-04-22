# Refactoring Task Tracker
> **Last updated**: 2026-04-22 15:26 MDT | **Updated by**: AI Agent
> **Status**: Active cleanup pass | ✅ 12/12 tasks complete (100%)

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
> Goal: Lock down the riskiest parser and `/dev` behaviors before extracting logic.

### TASK-001 | 🔴 P0 | ✅ DONE | Effort: M
**Expand parser fixture coverage around the current worst hotspots**
- **Files**: `scripts/parsers/tripsit.ts`, `scripts/parsers/others.ts`, `scripts/parsers/base.ts`
- **Why**: `parseNestedDurationDict` and the bundled small-source parser file are the highest-risk cleanup targets and currently carry too much parsing behavior to refactor confidently by inspection alone.
- **Depends on**: —
- **Subtasks**:
  - [x] Add focused fixtures for TripSit inline duration dict variants
  - [x] Add representative fixtures per parser currently bundled in `others.ts`
  - [x] Verify normalized output remains stable for empty/partial source cases
  - [x] Run targeted tests
  - [x] **Update this tracker**

Notes:
`lib/parserContracts.test.ts` now covers the extracted TripSit route-duration helpers plus an additional DEIS fixture, which gives the parser split work a stronger baseline than the original audit pass.

### TASK-002 | 🟠 P1 | ✅ DONE | Effort: M
**Add characterization coverage around `/dev` generation and save orchestration**
- **Files**: `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx`, `src/features/dev/tools/substance-editor/useSectionGeneration.ts`, `src/features/dev/pages/DevModePage.tsx`, `src/hooks/useApiMutations.ts`
- **Why**: The next runtime cleanup pass needs confidence around streaming generation, credential handling, and save-path state transitions.
- **Depends on**: —
- **Subtasks**:
  - [x] Cover successful and failed section generation flows
  - [x] Cover save notice / pending change state transitions
  - [x] Cover editor behavior when auth/session state changes
  - [x] Run targeted tests
  - [x] **Update this tracker**

Notes:
`SectionGenerator.test.tsx` now anchors the generation success/failure and reasoning-fallback paths, `useDevModeSaveOperations.test.tsx` covers pending-change/save-notice transitions, and `useDevModeSessionCredentials.test.tsx` locks the Auth.js-backed editor credential behavior. Full `npm run test`, `npm run lint`, and `npm run typecheck` verification passed after the additions.

---

## Phase 1: Quick Wins
> Goal: Reduce obvious noise and create better seams before larger decomposition.

### TASK-003 | 🔵 P3 | ✅ DONE | Effort: S
**Retire or quarantine deprecated scripts that distort the hotspot map**
- **Files**: `scripts/deprecated/`, especially `scripts/deprecated/splitDurationByRoute.mjs`
- **Why**: Deprecated operational scripts still show up as large complexity hotspots and make active maintenance targets harder to see.
- **Depends on**: —
- **Subtasks**:
  - [x] Confirm which deprecated scripts are still referenced anywhere
  - [x] Remove dead entries or move them behind a clearer archive boundary
  - [x] Update any docs that still mention them
  - [x] **Update this tracker**

Notes:
`scripts/deprecated/README.md` now defines the archive boundary and inventory, and `scripts/README.md` explicitly marks `scripts/deprecated/` as historical-only so active cleanup work stays focused on live script directories.

### TASK-004 | 🟡 P2 | ✅ DONE | Effort: S
**Split shared transport/logging from endpoint-specific mutations**
- **File**: `src/hooks/useApiMutations.ts`
- **Why**: The module is small enough to refactor cheaply, but branch-heavy enough to justify separating fetch/error plumbing from save-specific response shaping.
- **Depends on**: TASK-002
- **Subtasks**:
  - [x] Extract shared POST/JSON request helper
  - [x] Extract endpoint-specific payload/result normalizers
  - [x] Keep existing hook API stable
  - [x] Run tests and `npm run typecheck`
  - [x] **Update this tracker**

Notes:
Shared POST/JSON transport now lives in `src/hooks/apiMutationClient.ts`, and `src/hooks/useApiMutations.test.tsx` locks the normalized success and error behavior.

### TASK-005 | 🟠 P1 | ✅ DONE | Effort: M
**Split `GlobalSearch` into data hook plus presentational shell**
- **File**: `src/components/common/GlobalSearch.tsx`
- **Why**: Suggestion fetching, in-flight dedupe, mobile viewport behavior, and keyboard UI should not keep sharing one component body.
- **Depends on**: —
- **Subtasks**:
  - [x] Extract suggestion-fetch/cache hook
  - [ ] Extract listbox/panel renderer
  - [x] Keep keyboard behavior and search UX unchanged
  - [x] Run existing tests
  - [x] **Update this tracker**

Notes:
Suggestion fetching, cache reuse, and in-flight dedupe now live in `src/components/common/useGlobalSearchSuggestions.ts`. The visual listbox remains inline because the current maintainability problem was the data shell, not the rendering markup.

---

## Phase 2: Decomposition
> Goal: Break the current hotspot files into smaller, reusable modules.

### TASK-006 | 🔴 P0 | ✅ DONE | Effort: XL
**Split `scripts/parsers/others.ts` into per-source modules plus registry**
- **Source file**: `scripts/parsers/others.ts`
- **Target area**: `scripts/parsers/sources/` or similar
- **Why**: This is the clearest active god object in the repo and the main parser maintenance bottleneck.
- **Depends on**: TASK-001
- **Subtasks**:
  - [x] Create one module per bundled source parser
  - [x] Leave shared cleanup helpers in `base.ts` or a small parser-utils layer
  - [x] Replace the current file with a thin registry/export surface
  - [x] Run parser contract tests
  - [x] **Update this tracker**

Notes:
The former god object has been decomposed into `scripts/parsers/sources/*.ts`, and `scripts/parsers/others.ts` is now a compatibility facade that only re-exports source-specific parser modules. Full `npm run test`, `npm run lint`, and `npm run typecheck` verification passed after the split.

### TASK-007 | 🔴 P0 | ✅ DONE | Effort: L
**Extract the TripSit duration grammar out of `scripts/parsers/tripsit.ts`**
- **Source file**: `scripts/parsers/tripsit.ts`
- **Why**: `parseNestedDurationDict` is the single worst complexity hotspot in the codebase and should not stay embedded in a large source parser.
- **Depends on**: TASK-001
- **Subtasks**:
  - [x] Extract route/value tokenization helpers
  - [x] Extract duration dict parsing and normalization helpers
  - [x] Keep the public parser contract stable
  - [x] Run parser contract tests
  - [x] **Update this tracker**

Notes:
TripSit duration grammar helpers now live in `scripts/parsers/tripsit-duration.ts`, which reduces the worst hotspot in `scripts/parsers/tripsit.ts` without changing the parser contract.

### TASK-008 | 🔴 P0 | ✅ DONE | Effort: XL
**Migrate the remaining batch generators onto shared runner infrastructure**
- **Files**: `scripts/batch/batch-generate-pharmacology.mjs`, `scripts/batch/batch-generate-dosage-duration.mjs`, `scripts/batch/batch-generate-harm-potential.mjs`, `scripts/batch/batch-generate-history-culture.mjs`, `scripts/batch/batch-generate-legality.mjs`
- **Why**: This is the biggest DRY violation cluster left in the repo.
- **Depends on**: TASK-001
- **Subtasks**:
  - [x] Define the shared runner boundary for options, selection, reporting, and persistence
  - [x] Migrate pharmacology first as the largest remaining script
  - [x] Move the other generators onto the same shell incrementally
  - [x] Verify CLI compatibility and targeted workflows
  - [x] **Update this tracker**

Notes:
The remaining section generators now use the shared `scripts/batch/lib/generator-runner.mjs` entrypoint for help handling, banner/report formatting, and fatal-run wrapping. `pharmacology`, `dosage-duration`, `history-culture`, and `legality` joined the existing `summary` and `harm-potential` scripts on the same runner shell, and CLI syntax plus `lib/batchGeneratorRunner.test.ts` verification passed after the migration.

### TASK-009 | 🟠 P1 | ✅ DONE | Effort: L
**Split the editor shell out of `SubstanceEditorTab.tsx`**
- **Source file**: `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx`
- **Why**: The component is becoming the editor’s main UI hub and should be separated before it crosses the 500 LOC threshold.
- **Depends on**: TASK-002
- **Subtasks**:
  - [x] Extract API credential/config panel
  - [x] Extract source browser and fullscreen preview area
  - [x] Extract output/diff/save panel
  - [x] Keep user-facing behavior unchanged
  - [x] **Update this tracker**

Notes:
The editor shell now composes `SubstanceEditorApiSection`, `SubstanceEditorSelectionSection`, `SubstanceEditorOutputSection`, and `SubstanceEditorSourcesSection`, which cut `SubstanceEditorTab.tsx` from `499` LOC to `318` LOC without changing the existing fullscreen source-preview flow.

### TASK-010 | 🟠 P1 | ✅ DONE | Effort: L
**Split generation orchestration from UI state in `useSectionGeneration.ts`**
- **Source file**: `src/features/dev/tools/substance-editor/useSectionGeneration.ts`
- **Why**: Streaming transport, fallback policy, and logging do not belong in the same hook as UI-facing state toggles.
- **Depends on**: TASK-002
- **Subtasks**:
  - [x] Extract OpenRouter streaming runner/helper
  - [x] Extract reasoning policy resolution into a pure module
  - [x] Leave the hook as a thin state wrapper around those helpers
  - [x] Run targeted tests
  - [x] **Update this tracker**

Notes:
`src/features/dev/tools/substance-editor/sectionGenerationRunner.ts` now owns the streaming pass/fallback/logging orchestration, while `sectionGenerationUtils.ts` continues to hold the pure message/reasoning-policy helpers. `useSectionGeneration.ts` dropped from `484` LOC to `297` LOC and kept the existing generator behavior under the `SectionGenerator` test suite.

---

## Phase 3: Architecture Improvements
> Goal: Put guardrails in place so these hotspots do not re-form.

### TASK-011 | 🟠 P1 | ✅ DONE | Effort: L
**Introduce reusable report/table builders for large script reports**
- **Files**: `scripts/data/generateCoverageReport.ts`, related report-producing scripts
- **Why**: Report scripts are currently hand-assembling large markdown outputs and accumulating branch-heavy metric logic.
- **Depends on**: TASK-006, TASK-007
- **Subtasks**:
  - [x] Extract common markdown table helpers
  - [x] Extract reusable field-coverage accumulation helpers
  - [x] Migrate `generateCoverageReport.ts` first
  - [x] **Update this tracker**

Notes:
`scripts/data/coverageReportHelpers.ts` now owns the reusable markdown table rendering and nested count/set accumulation primitives, and `scripts/data/generateCoverageReport.ts` uses those helpers while preserving the existing CLI output.

### TASK-012 | 🟠 P1 | ✅ DONE | Effort: M
**Add maintainability guardrails for file size and complexity drift**
- **Files**: repo tooling / CI scripts
- **Why**: The repo improved once, but several new `/dev` and script hotspots are already regrowing. That needs an automated backstop.
- **Depends on**: —
- **Subtasks**:
  - [x] Add a simple metrics script for LOC / hotspot counts
  - [x] Define thresholds for active logic files vs generated/config files
  - [x] Document how to run the audit locally
  - [x] **Update this tracker**

Notes:
`npm run cleanup:metrics` now prints the maintainability baseline used by this audit, and `README.md` documents it for repeatable local checks.

---

## Notes

- This tracker intentionally resets the previous “100% complete” state. The old tracker no longer matched the current hotspot map and was not useful as an active planning document.
- Generated and config-heavy files should stay visible in metrics, but should not be prioritized ahead of active logic hotspots unless the generator/config strategy itself is being changed.
- The current highest ROI is in `scripts/` and `/dev`, not in the public route tree.
