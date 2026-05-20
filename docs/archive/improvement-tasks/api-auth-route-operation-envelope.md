# API/Auth Route Operation Envelope

## Files

- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-prompt/route.ts`
- `src/app/api/save-quote/route.ts`
- `src/app/api/save-substance-index/route.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/app/api/editor-config-health/route.ts`
- `src/app/api/test-env/route.ts`
- `src/lib/auth/requireEditorSession.ts`
- `src/lib/auth/requireAuthenticatedSession.ts`
- `lib/http/nextRateLimit.ts`
- `lib/convex/serverWriteHealth.ts`

## Problem

Protected route handlers repeat the same operation envelope: enforce rate limit, require an Auth.js session, check runtime configuration, parse a bounded JSON body, map known errors to JSON, log unexpected errors, and then run domain-specific work. The repetition is not only cosmetic. Each route has to remember the ordering, response shape, max payload handling, role guard, and configuration failure text.

The current Modules for auth, rate limiting, JSON parsing, and Convex health are individually useful, but the route-level Interface remains shallow. Callers and maintainers still need to understand most of the Implementation details in every handler to know whether an operation is protected consistently.

## Proposed deepening opportunity

Introduce a protected route operation Module for App Router handlers. Its Interface should describe the operation policy in one local declaration: role requirement, rate-limit policy, body limit/parser, required environment capabilities, and error labels. The Implementation should sequence rate limiting, auth, configuration checks, body parsing, and error-to-response mapping before invoking the route's operation function.

Keep the route files as thin HTTP adapters. They should define the route-specific operation and pass it to the shared Module instead of open-coding the same envelope.

## Benefits

- **Module**: concentrates the protected route envelope into one Module instead of many route-local reimplementations.
- **Interface**: callers state the operation's role, payload, rate, and capabilities without knowing the sequencing details.
- **Implementation**: response construction, known error handling, and logging policy move behind the Module.
- **Depth**: a small policy declaration provides leverage over authentication, body parsing, rate limiting, and config checks.
- **Seam**: the HTTP route remains the adapter seam, while the operation Module becomes the seam for changing protected-route behavior.
- **Adapter**: each route becomes an adapter from `Request` to the operation's typed input and output.
- **Leverage**: new protected write routes inherit the same failure modes and status codes by default.
- **Locality**: changes to auth response text, configuration failures, or rate-limit ordering happen in one place.

## Test plan

- Add unit tests for the operation Module covering unauthenticated, unauthorized, rate-limited, invalid JSON, missing capability, and successful execution cases.
- Add route-level tests for at least `save-prompt`, `save-quote`, and `save-user-profile` to prove existing HTTP statuses and response shapes remain stable.
- Add one regression test that verifies the operation function is not invoked after auth or configuration failure.
- Keep existing route-specific parser tests where the domain payload is complex.

## Risk/rollout notes

Roll out one route family at a time, starting with small Convex writes such as prompts and quotes before `save-to-convex`. Preserve existing status codes and public JSON keys during the first pass. Routes with special semantics, such as profile self-ownership and article revalidation, should only move the envelope first; their domain logic can remain local until follow-up work proves a deeper Module is warranted.
