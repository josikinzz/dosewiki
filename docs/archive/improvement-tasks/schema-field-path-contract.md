# Schema Field Path Contract

## Files

- `src/data/schema/pathUtils.ts`
- `src/data/schema/fieldRegistry.ts`
- `src/data/schema/fieldRegistry.generated.ts`
- `src/data/schema/fieldRegistry.generated/**`
- `src/data/schema/fieldOverrides/**`
- `src/data/schema/sectionRegistry.ts`
- `src/features/dev/forms/schema/**`

## Problem

Field paths are a key Interface for the editor, but they are represented as plain strings with several implicit dialects:

- template paths such as `dosage.routes[].dose_ranges.light`
- indexed paths such as `dosage.routes[0].route`
- ordinary nested paths such as `identification.common_name`
- override-only paths that may not exist in the generated schema registry

`pathUtils.ts` implements generic get/set behavior, `fieldRegistry.ts` merges path metadata, route fields are handled specially in the form layer, and section arrays repeat path strings. There is no single Module that defines the field path contract, parses paths, distinguishes template paths from concrete paths, or validates that a path is legal for a given operation.

This is a shallow seam: callers must understand path syntax and route-dependent exceptions themselves. The Interface is just `string`, so invalid paths can silently create new object shapes during `setValueByPath`.

## Proposed deepening opportunity

Create a field path Module that owns path parsing, normalization, and operation-specific validation. It should expose a small Interface for:

- parsing schema paths into typed path segments
- distinguishing template paths from indexed paths
- converting template paths to concrete route paths
- safe get and set operations against a `SubstanceArticle`
- validating registry, override, and section paths against known path rules

`pathUtils.ts` can remain the compatibility Adapter while delegating to the deeper Module. Form code and route-field code should use the same path Interface rather than hand-carrying string conventions.

## Benefits

- Module: makes field path behavior a real Module instead of a string convention.
- Interface: replaces broad `string` acceptance with explicit path operations and validation modes.
- Implementation: parsing, array handling, structured cloning, and missing-path behavior are concentrated.
- Depth: callers get safer article reads/writes with less path syntax knowledge.
- Seam: route-specific behavior can change at the path Module seam without editing every form caller.
- Adapter: existing `getValueByPath`, `setValueByPath`, `getFormValue`, and `setSchemaValue` can adapt legacy callers during rollout.
- Leverage: generated registry checks, section checks, and editor form updates all reuse one path contract.
- Locality: bugs from stale paths or accidental object creation are isolated to path validation.

## Test plan

- Add focused tests for path parsing: nested paths, template arrays, indexed arrays, records, invalid syntax, and empty paths.
- Add get/set tests for preserving existing article data while updating nested fields.
- Add tests that setting an invalid registry path fails or reports a diagnostic instead of silently creating incompatible shape.
- Add route-field tests for converting template paths to concrete dosage/duration paths.
- Run editor form tests plus `npm run typecheck`.

## Risk/rollout notes

- Keep the legacy path utility exports initially and migrate callers incrementally.
- Start with non-throwing diagnostics for paths already present in overrides or sections; tighten after stale paths are resolved.
- Be careful with record fields such as `reagent_testing` and `legality.countries`, where dynamic keys are expected.
- Structured cloning behavior should remain unchanged unless performance work is explicitly scoped later.
