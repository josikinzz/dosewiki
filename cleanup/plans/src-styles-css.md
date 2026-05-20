# CLN-017 Split global styles into token, base, component, and utility layers

- **Status**: ✅ DONE
- **File**: `src/styles.css`
- **Current size**: 1775 LOC
- **Category**: Active logic
- **Priority**: P1
- **Effort**: M
- **Strategy**: Stylesheet modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The global stylesheet carries design tokens, base element rules, prose/editor styling, component-level overrides, and utility definitions in one oversized file.

## Target End State

- `src/styles.css` becomes a thin import or composition layer.
- Tokens, base styles, component overrides, and utility layers are separated by responsibility.
- The visual system stays coherent while making future styling changes safer.

## Ordered Work Plan

1. Safety net and inventory
- Map existing selectors into layers: tokens, reset/base, prose/content, interactive components, and utilities.
- Extract each layer into a separate stylesheet partial if the build supports it, or a clearly segmented file tree if not.
- Keep token definitions centralized so brand/theme changes do not require scanning the whole stylesheet.
- Add lightweight visual smoke coverage or screenshot checks for the public shell and `/dev` shell before and after the split.
- Document which style concerns belong in global CSS versus component-local styles.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] Global CSS no longer acts as the default home for unrelated styling concerns.
- [x] Theme tokens are easy to audit.
- [x] The entry stylesheet stays below the cleanup threshold.
- [x] The central tracker entry for CLN-017 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- `src/styles.css` is now a thin entry file importing segmented partials under `src/styles/`.
- Base tokens and element rules now live in `base.css`; theme overrides are split across `theme-status.css`, `theme-light-mode.css`, and `lightbox.css`; shared utilities are split across `utilities-theme.css` and `utilities-typography.css`.
- Verification passed with `npm run build`.
- Post-split LOC check: `src/styles.css` 8, `base.css` 294, `components.css` 286, `theme-status.css` 130, `theme-light-mode.css` 404, `lightbox.css` 57, `utilities-theme.css` 439, `utilities-typography.css` 88.
