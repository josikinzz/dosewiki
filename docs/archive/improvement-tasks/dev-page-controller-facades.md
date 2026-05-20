# Dev Page Controller Facades

## Title

Split the Dev page controller into route, session, profile, changelog, and support-tab facades.

## Files

- `src/features/dev/pages/useDevModePageController.ts`
- `src/features/dev/pages/useDevModeSupportTabProps.ts`
- `src/features/dev/pages/devModePageTypes.ts`
- `src/features/dev/pages/DevModePage.tsx`
- `src/features/dev/pages/DevModePageView.tsx`

## Problem

`useDevModePageController` is the central Module for `/dev` page orchestration, but its Interface is nearly as broad as its Implementation. It owns Convex changelog mapping, responsive sticky-panel detection, Escape-key navigation, session/profile-key derivation, tab authorization redirects, save action wiring, About placeholder derivation, generator prompt clipboard behavior, and support-tab prop construction in one hook.

The friction shows up around `src/features/dev/pages/useDevModePageController.ts:39`, where callers need one controller, but maintainers must reason through unrelated concerns from `useDevMode`, `useLibrary`, `useSession`, Convex queries, changelog state, save actions, profile state, browser media queries, and tab navigation. The deletion test suggests the Module is not deep: deleting it would move complexity into the page view or nearby hooks rather than remove it behind a smaller Interface.

## Proposed deepening opportunity

Create deeper Modules around the actual `/dev` concepts:

- `useDevRouteAccess` for session state, role checks, profile-key derivation, and tab redirects.
- `useDevChangelogFeed` for static-plus-Convex changelog hydration and profile history selection.
- `useDevChromeEnvironment` for sticky-panel capability, Escape-to-close, layout class selection, and tab notice clearing.
- `useDevSupportTabsController` for profile/about/tags prop construction, replacing the current broad support-tab adapter.

Keep `useDevModePageController` as a thin composition Module whose Interface remains the page-facing `DevModePageControllerState`, but whose Implementation delegates behavior to deeper Modules at named seams. Each extracted Module should expose a small Interface with the minimum state and commands needed by the page controller.

## Benefits

- **Module**: Converts one shallow page-controller Module into several domain-named Modules that align with route access, changelog feed, page chrome, and support tabs.
- **Interface**: Gives tests and callers smaller Interfaces than the current controller-shaped argument and result surface.
- **Implementation**: Keeps Convex mapping, browser event wiring, and profile/session derivation in separate Implementations with less incidental coupling.
- **Depth**: Raises Depth because each new Module hides multi-step behavior behind a compact Interface.
- **Seam**: Creates seams where session/auth, Convex changelog data, and browser environment behavior can be varied independently.
- **Adapter**: Allows test Adapters for session state, changelog source, and browser environment instead of rendering the full page controller.
- **Leverage**: Page assembly gets the same behavior with less knowledge of data origin, authorization rules, and browser APIs.
- **Locality**: Changes to profile access, changelog hydration, or layout behavior stay local to their Modules instead of reopening the controller.

## Test plan

- Add focused hook tests for `useDevRouteAccess` covering unauthenticated profile redirects, authenticated non-editor redirects to profile, editor access, and derived profile keys.
- Add tests for `useDevChangelogFeed` covering static entries, Convex entries, duplicate static IDs, sorting, and profile history filtering.
- Add tests for `useDevChromeEnvironment` covering pointer media query behavior, Escape close wiring, and layout classes for `index-layout` versus regular tabs.
- Keep `DevModePage` integration tests as smoke coverage that the composed controller still returns the expected view props.

## Risk/rollout notes

This is a structural refactor of a high-traffic editor orchestration hook. Roll it out by extracting one Module at a time while preserving the existing `DevModePageControllerState` Interface. Avoid changing tab names, notice semantics, or public profile access rules during the refactor.
