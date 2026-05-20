# UI System: Deepen Route Chrome Module

## Files

- `src/app/layout.tsx`
- `src/app/_components/RouteChrome.tsx`
- `src/app/_components/NextHeader.tsx`
- `src/app/_components/NextFooter.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Footer.tsx`
- `src/types/navigation.ts`
- `src/utils/routing.ts`

## Problem

The public route chrome is split across a Next.js Adapter layer in `src/app/_components`, layout composition in `src/app/layout.tsx`, and shared layout Modules in `src/components/layout`. `RouteChrome` parses the pathname, derives announcement titles, and pushes routes. `Header` separately owns nav item definitions, active-section rules, desktop/mobile rendering, menu state, and link href derivation. `Footer` independently hard-codes another navigation surface.

This makes the current route chrome Module shallow. Its Interface is not a stable "site chrome model"; callers and maintainers must know route parsing, view-to-path mapping, page-title derivation, active nav grouping, mobile menu behavior, and footer link policy. The Implementation is spread across several files, so adding a public route or changing a navigation group requires auditing multiple Modules.

The deletion test suggests the current `NextHeader` and `NextFooter` Adapters do not add Depth: deleting them would remove almost no behavior. Meanwhile the real Seam between App Router pathname state and shared chrome presentation is inside `RouteChrome` and `Header`, but it is not named as such.

## Proposed deepening opportunity

Create a deeper route chrome Module that owns the site chrome model behind one small Interface, for example `getRouteChromeModel(pathname)` plus `SiteChrome` presentation props. The Module should centralize:

- page announcement title
- primary and secondary nav items
- active nav grouping rules
- route hrefs
- logo/home behavior
- footer nav policy

Keep the Next.js-specific pathname/router code as an Adapter at the App Router Seam. `Header` and `Footer` should consume the same route chrome model rather than recomputing link state or maintaining separate constants. Remove or fold pass-through Adapters such as `NextHeader` and `NextFooter` if no second Adapter needs them.

## Benefits

- **Module**: Turns scattered route chrome behavior into a named Module with one ownership point.
- **Interface**: Gives the shared chrome a route-oriented Interface instead of exposing `AppView`, `parsePath`, `viewToPath`, active-group rules, and footer policy to separate callers.
- **Implementation**: Hides title formatting, nav grouping, and mobile/desktop link lists in one Implementation.
- **Depth**: Increases Depth because a small route chrome model Interface carries multiple pieces of site behavior.
- **Seam**: Makes the App Router pathname/router Seam explicit and keeps Next.js details out of shared layout presentation.
- **Adapter**: Leaves room for a server Adapter, a test Adapter, or a future non-Next preview Adapter to supply the same chrome model.
- **Leverage**: New public routes can be added once and reflected consistently in header, footer, active states, and announcements.
- **Locality**: Route chrome changes stay local instead of touching `RouteChrome`, `Header`, `Footer`, and route helpers independently.

## Test plan

- Add unit tests for the route chrome model covering substances, categories, effects, reports, about, contributor, search, and dev route views.
- Add focused tests for active nav grouping so substance detail, mechanism, and classification routes all activate the substance group.
- Add component tests for `Header` and `Footer` using a supplied model Adapter rather than a live router.
- Run `npm run typecheck` and existing layout/footer tests.

## Risk/rollout notes

Start by extracting the pure model while preserving existing rendered markup and class names. Then update `Header` and `Footer` to consume the model. Keep `AppView` and `viewToPath` behavior unchanged during the first pass so this remains a chrome architecture refactor, not a routing policy change.
