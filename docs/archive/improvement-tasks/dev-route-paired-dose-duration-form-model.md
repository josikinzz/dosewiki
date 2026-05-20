# Dev Route-Paired Dose Duration Form Model

## Title

Move paired dosage and duration route editing into a route-pair form Module.

## Status

Proposed

## Files

- `src/hooks/useArticleForm.ts`
- `src/features/dev/forms/ArticleDraftFormFieldsRHF.tsx`
- `src/features/dev/forms/DosageDurationFieldsRHF.tsx`
- `src/features/dev/forms/rhf/DoseRangeStringInput.tsx`
- `src/features/dev/forms/rhf/DurationStageStringInput.tsx`
- `src/features/dev/forms/pharmacologyApplyGenerated.ts`
- `src/features/dev/forms/pharmacologyApplyGenerated.test.ts`

## Problem

Dosage routes and duration routes are stored as separate article sections, but the editor treats them as one route-paired workflow. `useArticleForm` creates default route shapes, watches `dosage.routes`, synchronizes `duration.routes` by index and route name, removes paired rows, and copies duration stages between rows. `DosageDurationFieldsRHF` then renders the paired rows by indexing both arrays together and adds route-specific controls.

The current Interface is shallow because the pairing invariants are implicit in React Hook Form field arrays. Maintainers need to know that dosage route order drives duration route order, that a route rename triggers duration replacement, that the last dosage row is replaced rather than removed, and that generated pharmacology may append missing routes through a separate helper. Bugs have weak Locality because route-pair behavior is split between the generic article form hook, a section renderer, and generated pharmacology update code.

This is narrower than the generated section update task. That task covers generated content application across editor, batch, and prepopulate workflows. This task covers the manual editor model for route-paired dosage and duration fields.

## Solution Plan

Create a route-paired form Module for dosage and duration editing. Its Interface should expose route-pair state and commands:

- `routePairs` containing dosage route, matching duration route, and stable UI identity
- commands such as `addRoutePair`, `removeRoutePair`, `renameRoute`, `copyDurationStages`, `replaceDosageRoutes`, and `replaceDurationRoutes`
- normalization helpers for empty dosage routes, empty duration routes, and preserving existing duration data when dosage routes change
- diagnostics for mismatched route counts, duplicate route names, and generated route additions

`useArticleForm` should delegate paired-route behavior to this Module while remaining the React Hook Form Adapter. `DosageDurationFieldsRHF` should render route pairs and dispatch commands rather than knowing the sync policy. `pharmacologyApplyGenerated` can reuse the same route normalization helpers when it appends missing routes.

## Benefits

- **Locality**: Route-pair invariants live in one Implementation instead of being distributed across a form hook, a field renderer, and a generated pharmacology helper.
- **Leverage**: Manual editing, generated pharmacology application, and future route reorder/duplicate handling can share the same pairing rules.
- **Testability**: The route-pair Module can be tested with plain article fixtures: add, remove, rename, copy stages, preserve half-life fields, append generated routes, and repair mismatched arrays without rendering React Hook Form.

## Implementation Notes

- Preserve current index-based pairing behavior during the first extraction to avoid changing editor semantics.
- Keep `useArticleForm` as the Adapter that wires the route-pair Module to `useFieldArray` and `setValue`/`replace`.
- Reuse existing empty route shapes, but move them behind named route-pair helpers so generated update code and manual editing do not drift.
- Be careful with route-name normalization: manual route names should remain user-entered strings, while matching logic can normalize for comparisons.

## Verification

- Add pure tests for the route-pair Module covering empty article defaults, one-row minimum behavior, paired removal, route rename sync, duration-stage copy, and mismatched route repair.
- Add parity tests around `useArticleForm` proving current field-array behavior remains stable.
- Extend `pharmacologyApplyGenerated.test.ts` or add route-pair tests proving generated route additions preserve existing dose ranges and duration stages.
- Run `npm run test -- src/hooks/useArticleForm src/features/dev/forms/pharmacologyApplyGenerated.test.ts` and `npm run typecheck`.
