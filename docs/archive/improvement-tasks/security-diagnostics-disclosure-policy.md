# Security Diagnostics Disclosure Policy

## Files

- `src/app/api/test-env/route.ts`
- `src/app/api/editor-config-health/route.ts`
- `lib/convex/serverWriteHealth.ts`
- `lib/runtime/publicEnv.ts`
- `auth.ts`
- `middleware.ts`
- `.env.example`
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`

## Problem

Diagnostic routes expose deployment health facts through route-local response shaping. `test-env` counts a hard-coded list of secret names, `editor-config-health` reports Convex write readiness, and runtime/auth helpers each know different pieces of the configuration story. Existing runtime-config proposals centralize env validation and Convex targeting, but they do not define a security disclosure Interface for what diagnostics may reveal to a browser caller.

That leaves a shallow diagnostic Module: each route decides which key names, counts, capability booleans, issue text, timestamps, and production gates are safe. The Implementation details of secrets and deployment posture leak into route code, and adding a new diagnostic risks exposing more than the operator actually needs.

## Proposed deepening opportunity

Create a diagnostics disclosure policy Module. Its Interface should accept internal health facts from runtime env, Auth.js policy, Convex write capability, and Convex target capability Modules, then produce a redacted diagnostic view for a named audience: public not-found, authenticated viewer, editor, admin, local developer, or build preflight.

The Module should own redaction rules, key-name disclosure rules, count disclosure rules, issue severity, and production availability. `test-env` and `editor-config-health` should become adapters that ask for the appropriate diagnostic view instead of constructing JSON directly. Documentation can describe the views without becoming the source of truth for what is safe to disclose.

## Benefits

- **Module**: makes diagnostic disclosure a security Module rather than route-local JSON.
- **Interface**: callers request an audience-specific diagnostic view instead of choosing fields by hand.
- **Implementation**: secret-name redaction, counts, booleans, issue wording, timestamps, and production gates live together.
- **Depth**: a small disclosure Interface hides sensitive configuration and route-specific presentation details.
- **Seam**: health facts cross a disclosure seam before they reach HTTP responses.
- **Adapter**: editor health, test-env, build preflight, and docs become adapters over the same disclosure policy.
- **Leverage**: new health checks can be added internally without automatically becoming browser-visible.
- **Locality**: changes to what editors or admins may see happen in one policy Implementation.

## Test plan

- Add table-driven tests for public, unauthenticated, editor, admin, local, production, and build-preflight diagnostic views.
- Add snapshot or structural tests proving no secret values are emitted and sensitive key names are only shown where explicitly allowed.
- Add route tests for `test-env` and `editor-config-health` proving they use the disclosure Module's response shape.
- Add regression tests for production gating so `ENABLE_TEST_ENV` cannot accidentally expose local-only diagnostics to public callers.
- Add docs consistency tests that ensure documented diagnostic fields match the Module's declared views.

## Risk/rollout notes

Keep existing editor-visible fields during the first migration, except for clearly unnecessary secret-name disclosure. Introduce stricter redaction in a preview deployment first so operators can verify they still have enough information to debug Convex and Auth.js setup. Avoid coupling this Module to the raw env contract Implementation; it should consume health facts, not re-read secrets.
