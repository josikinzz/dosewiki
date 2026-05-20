# API/Auth Convex Write Capability Module

## Files

- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-prompt/route.ts`
- `src/app/api/save-quote/route.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/app/api/editor-config-health/route.ts`
- `src/app/api/test-env/route.ts`
- `lib/convex/serverWriteHealth.ts`
- `lib/convex/serverClient.ts`
- `auth.ts`
- `lib/auth/convexMemberships.ts`

## Problem

Convex write capability is checked route-by-route with `getServerConvexAdminKey()`, while the write client is acquired separately through `getServerConvexWriteClient()`. Health routes expose similar configuration facts, and Auth.js membership sync has its own Convex client configuration path. Each write route must know that a successful server write requires both a Convex URL and `CONVEX_ADMIN_KEY`, then remember how to pass that key into each mutation.

The current Modules are individually small but shallow at the write-call seam. The Interface to a route is not "I have a server Convex write capability"; it is "fetch a client, fetch a key, check the key, pass both correctly, and map missing config to HTTP."

## Proposed deepening opportunity

Create a server Convex write capability Module. Its Interface should return either a ready write capability with client, admin key, deployment metadata, and health facts, or a typed configuration failure. Route handlers and operation-envelope code should depend on that capability instead of separately importing client and key helpers.

Auth membership sync can remain a separate read/write adapter if needed, but it should share the same Convex URL resolution Module so deployment configuration is not interpreted differently between Auth.js and App Router writes.

## Benefits

- **Module**: turns server Convex write readiness into one Module instead of separate key, client, and health helpers.
- **Interface**: routes request a write capability rather than assembling client and admin key facts themselves.
- **Implementation**: environment resolution, client caching, health details, and missing-config errors live behind the Module.
- **Depth**: the capability Interface hides multiple environment variables and client construction rules.
- **Seam**: the capability Module becomes the seam between HTTP routes and Convex deployment configuration.
- **Adapter**: App Router routes, diagnostics, and Auth.js membership sync become adapters over shared Convex configuration resolution.
- **Leverage**: every Convex write route gets consistent missing-config behavior and diagnostics.
- **Locality**: deployment variable changes and multi-deployment routing logic are localized.

## Test plan

- Add tests for capability resolution with `CONVEX_URL`, `VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`, missing URL, present admin key, and missing admin key.
- Add route-operation tests proving missing write capability maps to the current HTTP 500 response shape.
- Add health-route tests proving diagnostic output is derived from the same capability facts.
- Add a client-caching test if the Module owns client lifecycle.

## Risk/rollout notes

The first rollout should preserve existing environment-variable precedence and error wording. Be careful around `CONVEX_PUBLIC_READ_URL`, which is a read-side concern and should not silently become the write deployment. Keep the Module server-only and avoid exposing admin-key-derived facts to client bundles.
