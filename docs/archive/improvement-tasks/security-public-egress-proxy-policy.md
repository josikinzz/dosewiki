# Security Public Egress Proxy Policy

## Files

- `src/app/api/reagent-proxy/route.ts`
- `src/hooks/useReagentData.ts`
- `src/types/reagent.ts`
- `docs/improvement-tasks/chemistry-reagent-testing-adapter-module.md`
- `docs/improvement-tasks/api-auth-rate-limit-policy-adapter.md`

## Problem

The reagent proxy is a public egress route with CORS checks, input sanitization, and rate limiting, but its abuse-resistance policy is still embedded in the route Implementation. It fetches a fixed upstream host, forwards upstream status codes, parses the full JSON body without an explicit timeout or size ceiling, and returns validated CORS headers but no named egress policy. The existing reagent testing adapter proposal covers domain normalization and upstream response validation, while the rate-limit proposal covers request quotas; neither defines the public proxy egress Interface itself.

This makes the proxy Module shallow for security. A maintainer must inspect the route to know origin policy, upstream host policy, timeout behavior, status mapping, body limits, cacheability, negative caching, and failure modes. Those are proxy invariants, not reagent-domain details.

## Proposed deepening opportunity

Create a public egress proxy policy Module for the ProtestKit adapter. Its Interface should define allowed upstream hosts, request path construction, maximum input length, timeout, maximum response bytes, acceptable content types, upstream status mapping, cache policy, negative-cache policy, CORS audience, and log redaction.

`src/app/api/reagent-proxy/route.ts` should remain the HTTP adapter. The reagent testing Module can own candidate lookup and response validation, while this security Module owns the egress seam: how a public browser request is allowed to cause server-side network traffic and how upstream responses are bounded before becoming public output.

## Benefits

- **Module**: separates public proxy egress policy from reagent-domain normalization.
- **Interface**: the route asks for a bounded upstream fetch instead of hand-coding CORS, fetch, cache, and status behavior.
- **Implementation**: host allowlisting, timeout, size limits, content-type checks, status mapping, and cache headers live behind the Module.
- **Depth**: a compact egress Interface hides multiple abuse-resistance controls.
- **Seam**: the server-side network call becomes an explicit seam between public HTTP callers and ProtestKit.
- **Adapter**: the Reagent HTTP route is an adapter over the egress policy and the reagent testing adapter.
- **Leverage**: any future public proxy can reuse the same policy shape instead of inventing route-local controls.
- **Locality**: upstream failures, slow responses, cache poisoning concerns, and CORS changes are handled in one Implementation.

## Test plan

- Add egress policy tests for allowed host construction, rejected malformed input, timeout, response-size limit, and content-type rejection.
- Add route tests for CORS allow/deny behavior, 400 input failures, mapped upstream 404/5xx failures, timeout responses, and cache headers.
- Add tests proving upstream error bodies are not passed through verbatim.
- Add negative-cache tests for repeated missing substances so public traffic cannot hammer the upstream 404 path.
- Add log tests or assertions that request values are sanitized and upstream error details are redacted.

## Risk/rollout notes

Preserve the existing `/api/reagent-proxy?substance=` contract and successful response body during the first rollout. Add timeout and size limits conservatively so valid ProtestKit payloads are not truncated. Coordinate with the reagent testing adapter work so validation failures and egress failures produce distinct, stable error modes.
