# Test Types Vitest Environment Adapters

## Files

- `vitest.config.ts`
- `src/test/setup.ts`
- `src/data/builders/libraryBuilder.test.ts`
- `src/data/builders/contentBuilder.test.ts`
- `src/components/common/GlobalSearch.test.tsx`
- `src/features/dev/pages/DevModePage.test.tsx`
- `src/features/dev/context/DevModeContext.test.tsx`
- `src/features/dev/tools/index-layout/CategoryEditor.test.tsx`

## Problem

All Vitest tests run under one global `jsdom` environment and one global setup file. That setup file mocks `moleculeSvgMappings.json` and selected `lucide-react` icons for every test, while many individual tests also define local mocks for browser, Convex, Auth.js, DnD, image, prompt, and child component behavior.

This makes the test environment Interface shallow. A test can pass because a global mock silently replaced a production adapter, and maintainers must inspect both `src/test/setup.ts` and the test file to know which implementation is actually under test. The current seam is "whatever Vitest has globally mocked," not an explicit Module that declares the test environment contract.

The broad `jsdom` default also mixes Node-like logic tests, React rendering tests, and route/helper tests behind one runtime. That hides whether a Module actually needs DOM APIs, and it makes type/runtime drift harder to notice when code crosses from server helpers into client components.

## Proposed deepening opportunity

Create a test environment adapters Module that exposes named adapters for the common test seams:

- asset and icon adapters for SVG, JSON molecule maps, and `lucide-react`
- browser adapters for layout APIs, media queries, clipboard, focus, and fetch
- Convex/Auth.js adapters for session, role, and query state
- render adapters for components that need app providers

Keep `src/test/setup.ts` minimal: install jest-dom and low-level polyfills only. Tests should opt into named adapters from the test Module, so their Interface says which external behavior is being replaced. Split Vitest projects or configs by runtime where useful, such as Node tests for pure builders and server helpers, and jsdom tests for React rendering.

## Benefits

- **Module**: gives test setup a deliberate Module instead of a global file with hidden behavior.
- **Interface**: tests import named adapters that state the dependency seam they are using.
- **Implementation**: mock details for icons, assets, Convex, Auth.js, and browser APIs stay local to reusable adapters.
- **Depth**: a small test adapter Interface hides repeated `vi.mock` and render-wrapper setup across many tests.
- **Seam**: production adapters and test adapters meet at explicit seams rather than module-loader side effects.
- **Adapter**: jsdom, Node, Convex/Auth.js fakes, and asset mocks become concrete adapters selected per test.
- **Leverage**: adding a new component test or builder test reuses stable environment setup instead of cloning mocks.
- **Locality**: failures caused by environment drift are fixed in one test adapter Module.

## Test plan

- Add characterization tests or a smoke test for the test adapter Module itself, proving each adapter installs and resets cleanly.
- Move molecule SVG and icon mocks out of global setup into named asset adapters, then update builder/component tests that need them.
- Add separate Vitest runtime selection for pure Node tests versus jsdom render tests, even if both are still run by `npm run test`.
- Add reset assertions for stateful adapters such as fetch, session state, Convex query state, and browser layout APIs.
- Run `npm run test` and `npm run typecheck`.

## Risk/rollout notes

Start by adding adapters while leaving current global mocks in place, then migrate one low-risk test family at a time. Remove each global mock only after all tests that relied on it import the explicit adapter. Keep test output stable during the rollout; this task should change test locality, not production behavior.
