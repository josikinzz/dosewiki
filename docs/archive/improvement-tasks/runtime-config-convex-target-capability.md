# Runtime Config Convex Target Capability

## Files

- `.env.example`
- `next.config.ts`
- `lib/runtime/publicEnv.ts`
- `lib/convex/serverWriteHealth.ts`
- `lib/convex/serverClient.ts`
- `src/app/dev/[[...segments]]/page.tsx`
- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/app/api/editor-config-health/route.ts`
- `lib/auth/convexMemberships.ts`
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`

## Problem

Convex runtime targeting is encoded as several overlapping variable chains. Browser editor reads use `NEXT_PUBLIC_CONVEX_URL` or `VITE_CONVEX_URL`; server writes use `CONVEX_URL`, `VITE_CONVEX_URL`, or `NEXT_PUBLIC_CONVEX_URL`; public server reads can override with `CONVEX_PUBLIC_READ_URL`; membership sync has its own write URL lookup. The current names express variables, but not the capability being requested: public read, editor browser read, privileged write, or auth membership write.

That makes the Convex target Interface shallow. A maintainer must inspect each Implementation to know whether a given route will read production while writes still target dev, or whether a public browser URL is being reused as a server write URL. The existing `serverWriteHealth` Module helps save readiness, but it does not model the full read/write target policy as a single runtime capability.

## Proposed deepening opportunity

Create a Convex runtime target Module that exposes capability-specific accessors: public server read target, editor browser read target, privileged write target, and auth membership target. Each accessor should return the selected URL, the source env var, whether it is browser-safe, and whether the current deployment profile allows that target combination.

Use this Module behind `publicEnv`, `serverClient`, `serverWriteHealth`, membership sync, and editor config health. Add a diagnostics adapter that can report the active target matrix without leaking secrets, so preview and production deployments can show exactly which Convex deployment is used for each capability.

## Benefits

- Module: makes Convex targeting a runtime Module with named capabilities.
- Interface: callers request a capability instead of reconstructing URL precedence.
- Implementation: env precedence, browser safety, target compatibility, and diagnostics live in one place.
- Depth: a small target Interface hides a high-risk read/write deployment matrix.
- Seam: public reads, editor reads, privileged writes, and auth membership sync meet at one seam.
- Adapter: `ConvexHttpClient`, React Convex client props, health routes, and auth sync become adapters.
- Leverage: operators can intentionally mirror production reads locally without accidentally changing write targets.
- Locality: future Convex deployment naming or environment changes are localized to the target Module.

## Test plan

- Add table-driven tests for URL precedence across `CONVEX_PUBLIC_READ_URL`, `CONVEX_URL`, `VITE_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_URL`.
- Add tests that reject or warn on unsafe target combinations, such as privileged writes falling back to a public-only variable in production.
- Add route-level tests for editor health output to verify it reports selected capabilities without exposing `CONVEX_ADMIN_KEY`.
- Add an integration smoke test with mocked Convex clients proving public reads and writes use distinct configured targets when both are present.

## Risk/rollout notes

- Keep the existing precedence as compatibility mode first, but log the selected capability and source variable.
- Roll out stricter production checks after Vercel preview environments have the explicit write and public read variables set.
- Coordinate docs updates with operators because local workflows intentionally use production public reads with dev/editor writes.
