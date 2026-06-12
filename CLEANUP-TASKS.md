# Refactoring Task Tracker
> **Last updated**: 2026-04-22 17:02 MDT | **Updated by**: AI Agent
> **Status**: Cleanup complete | ✅ 11/11 tasks complete (100%)

> Scope note (2026-04-23): this root tracker documents an earlier completed cleanup wave.
> The active oversized-file cleanup program is now tracked separately in [archive/cleanup/CLEANUP-TASKS.md](archive/cleanup/CLEANUP-TASKS.md) and is code-only by user request.
> Final note (2026-04-23): the code-only cleanup program in `archive/cleanup/CLEANUP-TASKS.md` is now complete at 18/18 executed plans.
> Structure note (2026-04-23): the final site-organization pass is recorded in `archive/cleanup/CLEANUP-TASKS.md` as `STR-001`.

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
> Goal: Establish characterization coverage before changing the highest-risk cleanup targets.

### TASK-001 | 🔴 P0 | ✅ DONE | Effort: M
**Add characterization tests for `scripts/batch/batch-generate-pharmacology.mjs`**
- **File**: `scripts/batch/batch-generate-pharmacology.mjs`
- **Why**: This script is the largest active pipeline in the repo and currently mixes CLI parsing, Convex I/O, OpenRouter usage, YAML repair, and persistence with no direct test harness.
- **Depends on**: —
- **Subtasks**:
  - [x] Extract or expose pure helpers needed for testability without changing behavior
  - [x] Add tests around article filtering, YAML extraction/repair, and route merge behavior
  - [x] Verify the script still works through the current CLI entrypoint
  - [x] Run `npm run test`
  - [x] **Update this tracker**

Notes:
Pure helper coverage now lives in `lib/batchGeneratePharmacology.test.ts`, backed by the extracted implementation module `scripts/batch/pharmacology/lib.mjs`. The script’s `--help` entrypoint still works, and the full suite passed at `37` files / `174` tests.

---

### TASK-002 | 🔴 P0 | ✅ DONE | Effort: M
**Add characterization tests for `/dev` orchestration hotspots**
- **Files**: `src/features/dev/pages/DevModePage.tsx`, `src/features/dev/tools/index-layout/CategoryEditor.tsx`, `src/features/dev/forms/ChemistryFieldsRHF.tsx`
- **Why**: These files are refactor candidates but still rely mostly on indirect coverage. They need behavior-anchoring tests before controller/view splits.
- **Depends on**: —
- **Subtasks**:
  - [x] Cover tab redirection and session-gating behavior in `DevModePage.tsx`
  - [x] Cover add/remove/reorder behavior in `CategoryEditor.tsx`
  - [x] Cover generated pharmacology application behavior in `ChemistryFieldsRHF.tsx`
  - [x] Run `npm run test`
  - [x] **Update this tracker**

Notes:
Direct characterization tests now live in `src/features/dev/pages/DevModePage.test.tsx`, `src/features/dev/tools/index-layout/CategoryEditor.test.tsx`, and `src/features/dev/forms/ChemistryFieldsRHF.test.tsx`. The `DevModePage` test harness had to stabilize mocked hook return references to avoid a render-loop OOM, and the full suite passed at `40` files / `179` tests alongside a clean `npm run typecheck`.

---

## Phase 1: Quick Wins
> Goal: Remove low-risk duplication and improve seams before major decomposition.

### TASK-003 | 🟠 P1 | ✅ DONE | Effort: S
**Extract shared `SectionGenerator` prop construction for RHF editor sections**
- **Files**: `src/features/dev/forms/*FieldsRHF.tsx`
- **Why**: The same `SectionGenerator` setup is duplicated across many form sections, which makes prompt/runtime changes error-prone.
- **Depends on**: TASK-002
- **Subtasks**:
  - [x] Introduce a small helper or wrapper component for repeated generation props
  - [x] Replace duplicated inline prop blocks in the form sections
  - [x] Keep section-specific behavior unchanged
  - [x] Run `npm run test` and `npm run typecheck`
  - [x] **Update this tracker**

Notes:
Shared AI-generator wiring now lives in `src/features/dev/forms/ArticleSectionGenerator.tsx`, and all RHF section forms now consume that wrapper instead of inlining the `genericSources`, API config, and selected-substance props. A post-change scan found no remaining inline `SectionGenerator` context-prop blocks under `src/features/dev/forms/*FieldsRHF.tsx`, and the full suite remained green at `40` files / `179` tests with a clean `npm run typecheck`.

---

### TASK-004 | 🟡 P2 | ✅ DONE | Effort: S
**Centralize repeated batch CLI option parsing**
- **Files**: `scripts/batch/batch-generate-*.mjs`, `scripts/batch/batch-extract-harm-quotes.mjs`
- **Why**: CLI parsing and help output remain duplicated across the batch scripts even after runner sharing.
- **Depends on**: TASK-001
- **Subtasks**:
  - [x] Extract common option parsing helpers for concurrency, dry-run, verbose, slug filtering, and limit handling
  - [x] Keep existing flags and help text stable
  - [x] Verify representative script entrypoints
  - [x] **Update this tracker**

Notes:
Shared batch-CLI parsing now lives in `scripts/batch/lib/cli-options.mjs` and is used by `batch-generate-dosage-duration.mjs`, `batch-generate-harm-potential.mjs`, `batch-generate-history-culture.mjs`, `batch-generate-legality.mjs`, and `batch-extract-harm-quotes.mjs`. Representative `--help` checks for the harm quote extractor plus dosage-duration and history-culture generators remained stable after the extraction, and the full test suite still passed at `40` files / `179` tests.

---

### TASK-005 | 🔵 P3 | ✅ DONE | Effort: S
**Trim stale console diagnostics from mutation and generator paths**
- **Files**: `src/hooks/useApiMutations.ts`, batch generator scripts
- **Why**: Verbose inline logging obscures control flow and increases noise in tests and runtime output.
- **Depends on**: TASK-001, TASK-002
- **Subtasks**:
  - [x] Identify diagnostics that are no longer needed
  - [x] Keep actionable failure logging
  - [x] Preserve behavior and error messages that callers depend on
  - [x] Run `npm run test`
  - [x] **Update this tracker**

Notes:
Success-path request/response chatter was removed from `src/hooks/useApiMutations.ts`, while the actionable network and server error logging remained intact. The pharmacology generator form no longer emits parse/apply success diagnostics on every test run, and the suite stayed green at `40` files / `179` tests with a clean `npm run typecheck`.

---

## Phase 2: Decomposition
> Goal: Break god objects into focused, single-responsibility modules.

### TASK-006 | 🔴 P0 | ✅ DONE | Effort: XL
**Extract parser utility domains from `scripts/parsers/base.ts`**
- **Source file**: `scripts/parsers/base.ts` (701 LOC → target: <250 LOC)
- **Target files**: `scripts/parsers/base/dose.ts`, `scripts/parsers/base/duration.ts`, `scripts/parsers/base/markdown.ts`, `scripts/parsers/base/legality.ts`, `scripts/parsers/base/interactions.ts`
- **Methods to move**: `normalizeDoseUnit`, `parseDoseRange`, `parseDoseRangeWithUnit`, `normalizeDurationUnit`, `parseDurationRange`, `extractSections`, `extractSection`, `extractSubsections`, `extractBulletList`, `extractLabeledBullets`, `parseMarkdownTable`, `parseLabelValueTable`, `normalizeCountry`, `extractStatusAndNotes`, `detectInteractionSeverity`, `stripMarkdownLinks`, `cleanMarkdown`, `stripReferences`
- **Fields to move**: unit alias maps, route aliases, country aliases, indicator arrays, markdown regex constants
- **Why**: The file changes for too many reasons and is now the main parser-side maintenance bottleneck.
- **Depends on**: TASK-002
- **Risk**: Medium — parser helpers are reused widely, but `lib/parserContracts.test.ts` provides a regression net
- **Subtasks**:
  - [x] Create focused parser utility modules
  - [x] Keep a stable public export surface for current callers
  - [x] Update imports across parser files
  - [x] Run parser contract tests and full test suite
  - [x] Verify no circular dependencies introduced
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: `git revert` to commit before this task

Notes:
`scripts/parsers/base.ts` is now a thin stable facade over `scripts/parsers/base/dose.ts`, `duration.ts`, `markdown.ts`, `legality.ts`, and `interactions.ts`. Existing parser imports stayed untouched, `lib/parserContracts.test.ts` still passes, and the full suite remained green at `40` files / `179` tests with a clean `npm run typecheck`. A full audit-metrics refresh is being folded into the remaining decomposition work instead of churn-editing `CLEANUP-AUDIT.md` after each intermediate split.

---

### TASK-007 | 🔴 P0 | ✅ DONE | Effort: XL
**Decompose `scripts/batch/batch-generate-pharmacology.mjs` into a pipeline module set**
- **Source file**: `scripts/batch/batch-generate-pharmacology.mjs` (735 LOC → target: <250 LOC entrypoint)
- **Target files**: `scripts/batch/pharmacology/cli.mjs`, `scripts/batch/pharmacology/loader.mjs`, `scripts/batch/pharmacology/openrouter.mjs`, `scripts/batch/pharmacology/parser.mjs`, `scripts/batch/pharmacology/persist.mjs`
- **Methods to move**: `parseArgs`, `printHelp`, `loadPromptFromConvex`, `buildUserMessage`, `callOpenRouter`, `callWithRetry`, `parseGeneratedYaml`, `extractParsedPharmacology`, `repairCommonYamlIssues`, `extractPharmacologyYaml`, `mergeRouteDataIntoDosageDuration`, `processArticle`, `processAll`
- **Fields to move**: `CONFIG`, `INPUT_BOUNDS`, Greek sanitization helpers
- **Why**: This is the repo’s most overloaded active batch generator and the best script-side extraction target after `base.ts`.
- **Depends on**: TASK-001
- **Risk**: High — behavior spans environment validation, OpenRouter interaction, and Convex persistence
- **Subtasks**:
  - [x] Create a thin CLI entrypoint
  - [x] Move runtime and parsing helpers into dedicated modules
  - [x] Keep current CLI flags and output stable
  - [x] Update imports/references across the script family
  - [x] Run full test suite and representative dry runs
  - [x] Verify no circular dependencies introduced
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: `git revert` to commit before this task

Notes:
`scripts/batch/batch-generate-pharmacology.mjs` is now a thin entrypoint over `scripts/batch/pharmacology/cli.mjs`, `loader.mjs`, `openrouter.mjs`, `parser.mjs`, and `persist.mjs`, while still reusing the existing shared helper surface in `scripts/batch/pharmacology/lib.mjs`. The `--help` entrypoint stayed stable, `lib/batchGeneratePharmacology.test.ts` still passes, and the full suite remained green at `40` files / `179` tests with a clean `npm run typecheck`.

---

### TASK-008 | 🟠 P1 | ✅ DONE | Effort: L
**Extract generated-pharmacology application logic from `ChemistryFieldsRHF.tsx`**
- **Source file**: `src/features/dev/forms/ChemistryFieldsRHF.tsx` (377 LOC → target: <250 LOC)
- **Target file**: `src/features/dev/forms/pharmacologyApplyGenerated.ts`
- **Methods to move**: `normalizeRouteRecord`, `createBlankDosageRoute`, `createBlankDurationRoute`, `handleApplyGenerated` internals
- **Fields to move**: route-normalization and blank-route creation helpers
- **Why**: The form component should render fields, not own cross-section normalization and route creation logic.
- **Depends on**: TASK-002
- **Risk**: Medium — touches editor form state but has a bounded write scope
- **Subtasks**:
  - [x] Create a pure helper for generated pharmacology application
  - [x] Keep the form component API stable
  - [x] Add or update tests for route creation and field application
  - [x] Run `npm run test` and `npm run typecheck`
  - [x] Verify no circular dependencies introduced
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**
- **Rollback**: `git revert` to commit before this task

Notes:
Generated pharmacology application now lives in `src/features/dev/forms/pharmacologyApplyGenerated.ts`, while `ChemistryFieldsRHF.tsx` only handles form wiring. Direct helper coverage was added in `src/features/dev/forms/pharmacologyApplyGenerated.test.ts`, bringing the suite to `41` files / `180` tests with a clean `npm run typecheck`.

---

### TASK-009 | 🟠 P1 | ✅ DONE | Effort: L
**Split `DevModePage.tsx` into controller and presentational shells**
- **Source file**: `src/features/dev/pages/DevModePage.tsx` (405 LOC → target: <250 LOC)
- **Target files**: `src/features/dev/pages/useDevModePageController.ts`, `src/features/dev/pages/DevModePageView.tsx`
- **Methods to move**: session/profile gating effects, placeholder count calculation, support-tab prop assembly, sign-in redirect, tab change control
- **Fields to move**: local orchestration state such as `enableStickyPanels`, `profileData`, `changeLogEntries`
- **Why**: The `/dev` root should not directly own session control, hydration, and view rendering in one component.
- **Depends on**: TASK-002
- **Risk**: Medium — central shell component with many call sites nearby but limited external API
- **Subtasks**:
- [x] Extract a controller hook for state/effects
- [x] Keep `DevModePage` as a thin composition layer
- [x] Preserve current tab behavior and session gating
- [x] Run tests and `npm run typecheck`
- [x] Verify no circular dependencies introduced
- [x] Update `CLEANUP-AUDIT.md` metrics
- [x] **Update this tracker**
- **Rollback**: `git revert` to commit before this task

Notes:
`DevModePage.tsx` is now a thin composition layer over `useDevModePageController.ts` and `DevModePageView.tsx`, with the page props extracted into `devModePageTypes.ts`. The direct `DevModePage` characterization test still passes and `npm run typecheck` stayed clean. The audit refresh is being completed once across the remaining architecture tasks rather than rewritten after each intermediate extraction.

---

## Phase 3: Architecture Improvements
> Goal: Reduce coupling and prevent the same hotspots from reforming.

### TASK-010 | 🟠 P1 | ✅ DONE | Effort: L
**Introduce a renderer registry for `VCodeRenderer.tsx`**
- **Source file**: `src/features/effects/vcode/VCodeRenderer.tsx`
- **Target file**: `src/features/effects/vcode/renderers.tsx`
- **Why**: The large tag switch is the main extensibility bottleneck for EffectIndex rendering.
- **Depends on**: —
- **Subtasks**:
- [x] Define a registry or map from tag name to renderer
- [x] Move simple render cases out of the main component
- [x] Keep fallback behavior for unknown tags
- [x] Run tests covering representative render cases
- [x] Update `CLEANUP-AUDIT.md` metrics
- [x] **Update this tracker**

Notes:
`src/features/effects/vcode/renderers.tsx` now owns the tag-to-renderer mapping and shared heading/markdown helpers, while `VCodeRenderer.tsx` mainly handles recursion and unknown-tag fallback. Direct coverage was added in `src/features/effects/vcode/VCodeRenderer.test.tsx`, and both the new test file and `npm run typecheck` passed. The audit refresh is being completed once in the final guardrail pass.

---

### TASK-011 | 🟡 P2 | ✅ DONE | Effort: M
**Add maintainability guardrails for cleanup hotspots**
- **Files**: `scripts/analyze/cleanup-metrics.ts`, repo docs, optionally CI config
- **Why**: The repo already has metrics output, but no threshold-based enforcement for the current debt frontiers.
- **Depends on**: TASK-006, TASK-007
- **Subtasks**:
  - [x] Extend the metrics script with hotspot thresholds for active logic files
  - [x] Distinguish generated/config files from active logic in the report
  - [x] Document how to use the metrics in PR review
  - [x] Update `README.md` if the workflow changes
  - [x] Update `CLEANUP-AUDIT.md` metrics
  - [x] **Update this tracker**

Notes:
`scripts/analyze/cleanup-metrics.ts` now reports category splits for active logic versus generated/config-heavy files, tracks budgeted hotspot files, and supports `npm run cleanup:metrics -- --check` for regression enforcement. `README.md` now documents that review loop, and the refreshed audit reflects the post-cleanup metrics baseline.

---

## Completed Tasks Log

| Task | Completed | Before Metrics | After Metrics |
|------|-----------|---------------|--------------|
| TASK-001 | 2026-04-22 16:17 MDT | No direct pharmacology batch characterization tests; script-local helpers only | `scripts/batch/pharmacology/lib.mjs` extracted; `lib/batchGeneratePharmacology.test.ts` added; full suite `37` files / `174` tests passing |
| TASK-002 | 2026-04-22 16:24 MDT | `/dev` orchestration relied on indirect coverage only | Direct tests added for `DevModePage`, `CategoryEditor`, and `ChemistryFieldsRHF`; full suite `40` files / `179` tests and `npm run typecheck` passing |
| TASK-003 | 2026-04-22 16:29 MDT | Repeated `SectionGenerator` context prop wiring across RHF forms | `ArticleSectionGenerator.tsx` added and RHF forms migrated; no inline context-prop blocks remain in `*FieldsRHF.tsx`; full suite `40` files / `179` tests and `npm run typecheck` passing |
| TASK-004 | 2026-04-22 16:33 MDT | Repeated flag parsing loops across batch generators and extractor scripts | `scripts/batch/lib/cli-options.mjs` added and representative scripts migrated; `--help` entrypoints verified; full suite `40` files / `179` tests passing |
| TASK-005 | 2026-04-22 16:35 MDT | Save/mutation and pharmacology application paths emitted noisy success diagnostics | Informational chatter trimmed from `useApiMutations.ts` and `ChemistryFieldsRHF.tsx`; actionable error logs preserved; full suite `40` files / `179` tests and `npm run typecheck` passing |
| TASK-006 | 2026-04-22 16:42 MDT | `scripts/parsers/base.ts` mixed dose, duration, markdown, legality, and interaction helpers in one 700+ LOC file | Split into focused modules under `scripts/parsers/base/` while keeping `base.ts` as the stable export surface; parser contracts, full suite, and typecheck passing |
| TASK-007 | 2026-04-22 16:45 MDT | `batch-generate-pharmacology.mjs` combined CLI, Convex loading, OpenRouter transport, parsing, and persistence | Split into dedicated `pharmacology/*.mjs` modules with a thin entrypoint; help output, pharmacology tests, full suite, and typecheck passing |
| TASK-008 | 2026-04-22 16:47 MDT | `ChemistryFieldsRHF.tsx` owned generated-pharmacology parsing and cross-section route mutation inline | `pharmacologyApplyGenerated.ts` extracted with direct tests; component kept stable API; full suite `41` files / `180` tests and `npm run typecheck` passing |
| TASK-009 | 2026-04-22 16:54 MDT | `DevModePage.tsx` mixed session gating, changelog hydration, support-tab prop assembly, and render branching in one shell component | Split into `useDevModePageController.ts`, `DevModePageView.tsx`, and `devModePageTypes.ts`; direct page tests and `npm run typecheck` passing |
| TASK-010 | 2026-04-22 16:57 MDT | `VCodeRenderer.tsx` used a large switch as the main extensibility path for VCode tags | Renderer registry moved to `renderers.tsx` with direct render/fallback tests; `npm run typecheck` passing |
| TASK-011 | 2026-04-22 17:02 MDT | Cleanup metrics were informative but non-enforcing and did not separate active logic from generated/config-heavy files | Added hotspot budgets plus `--check` mode to `cleanup-metrics`, documented the review workflow in `README.md`, and refreshed the audit/tracker to the new baseline |
