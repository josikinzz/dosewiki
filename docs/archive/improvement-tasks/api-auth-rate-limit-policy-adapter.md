# API/Auth Rate Limit Policy Adapter

## Files

- `lib/http/nextRateLimit.ts`
- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-substance-index/route.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/app/api/save-prompt/route.ts`
- `src/app/api/save-quote/route.ts`
- `src/app/api/reagent-proxy/route.ts`
- `src/app/api/editor-config-health/route.ts`
- `src/app/api/test-env/route.ts`
- `src/app/api/search-suggestions/route.ts`

## Problem

Rate limiting is enforced through a useful helper, but policy is embedded as ad hoc `{ windowMs, max }` values in each route. The limiter also chooses the client key, Upstash adapter, in-memory fallback, and response shape in the same Module. Public reads, external proxies, editor writes, diagnostics, and large saves all use the same Interface even though they have different risk profiles.

This creates a shallow Module: the route still owns most of the policy, while `nextRateLimit.ts` owns transport-specific Implementation details. There is no named policy that explains why a save route gets 5 requests per minute, why prompt writes get 20, or whether an authenticated user key should be preferred over an IP key.

## Proposed deepening opportunity

Split rate limiting into a policy Module and storage adapters. The policy Interface should expose named intents such as `editorHeavyWrite`, `editorSmallWrite`, `authenticatedProfileWrite`, `publicProxyRead`, and `diagnosticRead`. Each policy should define window, max, key strategy, response shape, and fallback behavior. The Implementation can then select an Upstash adapter or in-memory adapter behind a storage seam.

Routes should call the named policy through the protected route operation Module or directly for public routes. `search-suggestions` should be reviewed explicitly: either document why it is cache-only without rate limiting, or attach a public search policy.

## Benefits

- **Module**: separates rate-limit policy from the storage Implementation.
- **Interface**: routes choose a named operation intent instead of repeating numeric limits.
- **Implementation**: Upstash construction, in-memory fallback, pruning, and retry headers stay behind adapters.
- **Depth**: the policy Interface hides keying, fallback, and response behavior behind a small set of route intents.
- **Seam**: storage adapters form a real seam because Upstash and memory are two concrete adapters.
- **Adapter**: IP keying and authenticated-user keying become adapters selected by policy.
- **Leverage**: changing editor-write limits or adding authenticated-user limits applies across related routes.
- **Locality**: limit rationale and route classification live together instead of being inferred from scattered numbers.

## Test plan

- Add policy tests that assert each named intent's window, max, key strategy, and fallback mode.
- Add adapter tests for Upstash success, Upstash denial, Upstash failure fallback, and in-memory expiration.
- Add route tests proving editor write routes use the expected named policy.
- Add a public search/proxy test covering response headers and retry behavior when limited.

## Risk/rollout notes

Preserve current numeric limits during the first migration. The main behavior risk is key strategy: switching from IP-only to authenticated-user-aware limits can alter production behavior behind proxies. Add metrics or structured logs for policy name and key type before changing limits or keying.
