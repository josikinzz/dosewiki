# DevModePage Cleanup Plan
> Scope: `src/features/dev/pages/DevModePage.tsx`
> Generated: 2026-04-10
> Status: Phase 5 | 8/8 tasks complete

## Orientation

- Stack: Next.js App Router, React, TypeScript, Auth.js, Convex.
- Architecture: client-heavy editor shell with feature tabs under `src/features/dev/`.
- Verification commands: `npm run lint`, `npm run typecheck`, `npm run test`.
- Active responsibility of `DevModePage.tsx`: route-level orchestration for `/dev`, session chrome, commit/save orchestration, and tab switching.

## Baseline Audit

- File LOC: 2,009 (`wc -l src/features/dev/pages/DevModePage.tsx`)
- Severity: `P0` god object
- Primary smells:
  - Mixed responsibilities: page shell, Auth.js session UI, change-log aggregation, GitHub/Convex save flow, legacy article YAML editor, legacy new-article staging, and tab routing.
  - Dead legacy subsystem still embedded in the page even though article editing now renders `SubstanceEditorTab`.
  - Large local state surface increases coupling and makes changes risky.

## Priority Findings

1. `P0`: Legacy article editing and creation logic remains inside the page but is not part of the active UI.
   - Evidence: the block spanning roughly lines `137-1702` defines article selection, YAML parsing, creation staging, deletion, and category-jump helpers, while the render path at lines `1994-2004` delegates article work to `SubstanceEditorTab`.
   - Impact: unnecessary state, duplicated behavior, and a misleading maintenance surface.

2. `P1`: Save orchestration is mixed with unrelated route chrome and auth presentation.
   - Evidence: save logic at roughly lines `1110-1783` sits in the same component as the auth card and tab navigation at `1866-1977`.
   - Impact: poor readability and harder regression review.

3. `P2`: Repeated page-header and tab-shell JSX makes the route component noisier than necessary.
   - Evidence: loading and ready states both inline the same title shell around `1838-1864`.
   - Impact: low-signal duplication and harder future UI edits.

## Refactor Tasks

| ID | Priority | Status | Effort | Task | Notes |
|---|---|---|---|---|---|
| DMP-001 | P0 | ✅ DONE | M | Remove dead legacy article-editor responsibilities from `DevModePage.tsx` | Deleted the inactive YAML/new-article/delete/category-jump subsystem from the page and kept article editing delegated to `SubstanceEditorTab`. |
| DMP-002 | P1 | ✅ DONE | S | Re-baseline imports, local state, and commit panel inputs after DMP-001 | Rebuilt `DevModePage.tsx` around the active page contract only. |
| DMP-003 | P2 | ✅ DONE | S | Extract or simplify repeated shell/auth chrome where it improves readability | Extracted route chrome into `src/features/dev/pages/DevModePageChrome.tsx`, including heading, auth card, tabs, and loading state. |
| DMP-004 | P0 | ✅ DONE | S | Verify with targeted lint/typecheck and record residual risks | `npx eslint src/features/dev/pages/DevModePage.tsx src/features/dev/pages/DevModePageChrome.tsx` and `npx tsc --noEmit --pretty false` both pass after the extraction. |
| DMP-005 | P1 | ✅ DONE | M | Extract derived changelog state into a dedicated hook | Implemented `src/features/dev/pages/useDevModeChangelogState.ts`. |
| DMP-006 | P1 | ✅ DONE | M | Extract GitHub/Convex save orchestration into a dedicated hook | Implemented `src/features/dev/pages/useDevModeSaveActions.tsx`. |
| DMP-007 | P2 | ✅ DONE | S | Rebuild `DevModePage.tsx` around orchestration-only composition | `DevModePage.tsx` now composes hooks plus route/tab wiring and is below the `<500` LOC target. |
| DMP-008 | P0 | ✅ DONE | S | Re-run targeted verification and record post-extraction LOC | `eslint` and `tsc --noEmit` pass after the second extraction phase. |

## Next Extraction Plan

### Hook 1: `useDevModeChangelogState`

- Scope:
  - `originalArticles`, `originalAbout*`, and `originalGeneratorPrompt` memoized source reads.
  - `aboutMarkdownChangelog`, `aboutSubtitleChangelog`, `aboutFounderChangelog`, `psychoactiveManualChangelog`, and `datasetChangelog`.
  - `hasPendingChanges` booleans and `combinedChangelogMarkdown`.
- Proposed return shape:
  - `datasetChangelog`
  - `psychoactiveManualChangelog`
  - `aboutMarkdownChangelog`
  - `aboutSubtitleChangelog`
  - `aboutFounderChangelog`
  - `generatorPromptChangelog`
  - `combinedChangelogMarkdown`
  - `hasPendingChanges`
- Goal:
  - Remove the large derivation block from `DevModePage.tsx` without changing behavior or tab prop contracts.

### Hook 2: `useDevModeSaveActions`

- Scope:
  - `passwordKey`, `githubNotice`, `convexNotice`, and `isConvexSaving`.
  - `verifyDevCredentials`.
  - `handleSaveToGitHub` and `handleSaveToConvex`.
  - `primaryCommitNotice`, `isCommitDisabled`, `isConvexSaveBlocked`, `convexSaveButton`, and `renderCommitPanel`.
- Proposed inputs:
  - session/auth state
  - mutations
  - changelog state from `useDevModeChangelogState`
  - current editor content from `useDevMode`
  - change-log append/push callbacks
- Proposed outputs:
  - `passwordKey`
  - `setPasswordKey`
  - `verifyDevCredentials`
  - `commitPanel`
  - `renderCommitPanel`
  - `primaryCommitNotice`
- Goal:
  - Collapse save-side effects and commit-panel assembly into one reusable orchestration boundary.

### Success Criteria For Next Slice

- `DevModePage.tsx` drops below 500 LOC.
- Save-related notice state no longer lives directly in the page component.
- Changelog derivation no longer lives directly in the page component.
- `useDevModeSupportTabProps` can consume extracted outputs without API churn to tab components.

## Progress Log

- 2026-04-10 00: Initial scoped audit created for `DevModePage.tsx`.
- 2026-04-10 01: Removed the disconnected legacy article-editor subsystem from `DevModePage.tsx`.
- 2026-04-10 02: Extracted page chrome into `src/features/dev/pages/DevModePageChrome.tsx`.
- 2026-04-10 03: Targeted lint and typecheck pass after the cleanup.
- 2026-04-10 04: Added concrete follow-up tasks for extracting changelog derivation and save orchestration into hooks to push the page below the 500 LOC warning threshold.
- 2026-04-10 05: Extracted `useDevModeChangelogState.ts` and `useDevModeSaveActions.tsx`, reducing `DevModePage.tsx` below the 500 LOC warning threshold.
- 2026-04-10 06: Targeted lint and typecheck pass after the second cleanup phase.

## Outcome

- `DevModePage.tsx` dropped from 2,009 LOC to 430 LOC.
- Repeated title/auth/tab shell UI moved to `src/features/dev/pages/DevModePageChrome.tsx` (183 LOC).
- Changelog derivation now lives in `src/features/dev/pages/useDevModeChangelogState.ts` (214 LOC).
- Save orchestration now lives in `src/features/dev/pages/useDevModeSaveActions.tsx` (471 LOC).
- The page now focuses on active orchestration: change-log state wiring, session/profile wiring, tab routing, and hook composition.

## Residual Follow-Up

- `DevModePage.tsx` is now below the 500 LOC warning threshold.
- The next optional cleanup slice is to reduce `useDevModeSaveActions.tsx`, which is now the densest remaining orchestration unit at 471 LOC.
- If this area changes frequently, a sensible next split is separating commit-panel UI assembly from network save handlers inside the save hook layer.

## Exit Criteria

- `DevModePage.tsx` only owns active page-level orchestration concerns.
- Legacy article editor logic is removed or relocated behind components that still use it.
- The file is materially smaller and easier to review.
- Targeted verification passes or failures are documented here.
