# Convex Authz Write Intents

## Files

- `convex/lib/auth.ts`
- `convex/memberships.ts`
- `convex/contributorProfiles.ts`
- `convex/substanceIndex.ts`
- `auth.ts`
- `lib/auth/convexMemberships.ts`
- `src/lib/auth/requireEditorSession.ts`
- `src/lib/auth/requireAuthenticatedSession.ts`
- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-user-profile/route.ts`

## Problem

Convex write functions authenticate with `requireAuth`, but authorization depth is mostly outside the Convex function interface. `requireAuth` accepts either `CONVEX_ADMIN_KEY` or Convex identity and returns only user identity data. Editor-only substance writes in `convex/substanceIndex.ts` call `requireAuth` but do not check membership roles. Contributor profile writes accept `actorEmail` and optional `actorRole` as caller-provided mutation arguments after the server route has already authenticated through Auth.js.

This makes the effective write policy span Auth.js callbacks, server route guards, an admin key adapter, Convex membership rows, and per-function hand checks. The current Module is shallow: callers must know whether a write requires an editor, any authenticated user, a self-profile owner, or a script key, and those rules are not expressed by the Convex mutation interface itself.

## Proposed deepening opportunity

Introduce a Convex-side write-intent Module whose Interface is shaped around intent, for example editor write, authenticated self write, script/admin write, and public read. The Implementation should resolve the actor from Convex identity or API key, read `memberships` when a role is needed, and return an authorized actor object that downstream mutations use without accepting caller-supplied role facts.

Next.js route guards can remain as UX and rate-limit seams, but Convex mutations should enforce their own write intent at the database seam. `auth.ts` and `lib/auth/convexMemberships.ts` become adapters that sync memberships and populate sessions, not the source of write authorization truth.

## Benefits

- **Module**: turns scattered route/mutation role checks into one Convex authorization Module with a small, intention-revealing Interface.
- **Interface**: callers say which write intent they need instead of passing `apiKey`, `actorEmail`, and `actorRole` facts that must stay consistent.
- **Implementation**: membership lookup, API-key fallback, legacy credentials handling, and error shaping live behind the Module.
- **Depth**: a small Interface hides the branching policy across Auth.js, Convex identity, API key scripts, and membership roles.
- **Seam**: the Convex mutation entrypoint becomes the durable authorization seam; App Router routes are adapters at the HTTP seam.
- **Adapter**: scripts can remain an API-key adapter, while browser/server routes use an authenticated-user adapter.
- **Leverage**: every protected Convex write gets the same role semantics without reimplementing them.
- **Locality**: future role changes, audit logging, or editor/admin distinctions happen in one place.

## Test plan

- Add Convex tests for the authorization Module covering viewer, editor, admin, unknown user, API-key actor, and missing membership cases.
- Add mutation-level tests proving editor-only substance writes reject viewers even when invoked directly.
- Add profile tests proving self-profile writes do not trust caller-provided `actorRole`.
- Add App Router tests that route guards still map auth failures to stable HTTP statuses.

## Risk/rollout notes

Roll out behind existing route behavior first: keep server routes calling the same mutations, but have Convex derive actor role itself and compare results in logs. Scripts using `CONVEX_ADMIN_KEY` need an explicit script/admin actor path so migrations and batch generation do not break. Legacy credentials currently become `admin` in `auth.ts`; document whether that remains a development-only adapter or should be modeled in Convex memberships.
