# Test Types JS Declaration Contract

## Files

- `lib/article/normalization.js`
- `lib/article/normalization.d.ts`
- `lib/article/normalization.test.ts`
- `src/features/article/components/sections/PharmacologySection.tsx`
- `src/features/article/components/sections/TableOfContentsSection.tsx`
- `src/features/dev/forms/pharmacologyApplyGenerated.ts`
- `src/features/dev/tools/substance-editor/yamlParser.ts`
- `src/features/dev/tools/substance-editor/yamlParserSectionNormalizers.ts`
- `src/data/builders/contentBuilder.ts`
- `src/utils/data/tagRegistry.shared.ts`
- `lib/server/github/*.js`
- `lib/server/logger.js`

## Problem

Some active runtime Modules are JavaScript implementations consumed from TypeScript. `lib/article/normalization.js` has a hand-written declaration file, and multiple TypeScript Modules import it directly. The declaration file is the type Interface, but it is not generated from or checked against the JavaScript Implementation. If `normalizePharmacologySection`, `hasPharmacologyContent`, or route normalization behavior changes in JS, TypeScript callers can continue compiling against stale declarations.

The server GitHub helpers are also JavaScript Modules with tests, but their typed Interface is implicit at import sites or avoided through dynamic imports. That creates a weak seam between server helper Implementation and TypeScript route/helper callers. The test surface currently checks selected runtime behavior, not whether the declared or inferred Interface matches the production exports.

This is distinct from the article schema contract tasks: the gap here is not article field depth itself, but the declaration seam where TypeScript callers trust JavaScript Modules.

## Proposed deepening opportunity

Create a JS declaration contract Module for active JavaScript runtime helpers. The Interface should define how declarations are produced, validated, and tested for JS Modules that remain JavaScript. Reasonable rollout options:

- migrate active JS helper Modules to TypeScript where the repo already typechecks `lib`
- or emit declarations from JSDoc-typed JavaScript and check them in CI
- or add a focused type-test command using declaration fixtures for JS Modules that intentionally stay JavaScript

For `lib/article/normalization`, make the declaration contract prove that exported function names, parameter types, return types, and optional compatibility fields stay aligned with runtime exports. For server GitHub helpers, expose a typed adapter Interface for route code instead of relying on implicit JS shapes.

## Benefits

- **Module**: declaration checking becomes a Module for JS/TS interop instead of ad hoc `.d.ts` files.
- **Interface**: TypeScript callers get a validated Interface for JavaScript helpers.
- **Implementation**: runtime parsing, normalization, logging, and GitHub write behavior can remain inside JS Implementations during migration.
- **Depth**: a small declaration contract gives leverage over many TypeScript call sites importing JS helpers.
- **Seam**: the JS/TS import seam becomes explicit and testable.
- **Adapter**: TypeScript route code and React builders consume typed adapters over JS helpers while the Implementation can be migrated gradually.
- **Leverage**: future JS helper changes fail fast when declarations drift.
- **Locality**: type drift bugs are investigated in one declaration contract workflow rather than at unrelated call sites.

## Test plan

- Add a type-level fixture for `lib/article/normalization.js` that imports every public export and asserts representative assignability for parameters and returns.
- Add a runtime export-shape test that compares the declared public export list to the actual JavaScript module exports.
- Add declaration or adapter tests for active `lib/server/github/*.js` helpers used by TypeScript routes.
- Add a package script such as `test:types` or fold the check into `npm run typecheck` once stable.
- Run `npm run typecheck` and the relevant Vitest tests.

## Risk/rollout notes

Do not migrate every JavaScript helper at once. Start with `lib/article/normalization.js` because it already has a declaration file and many TypeScript consumers. Then cover server GitHub helpers that are part of protected write routes. Keep generated or emitted declarations reviewed separately from behavior changes.
