# Convex Contributor Profile Identity Module

## Files

- `convex/contributorProfiles.ts`
- `convex/lib/contributorProfiles.ts`
- `src/data/userProfiles.ts`
- `lib/convex/publicData.contributors.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/hooks/useContributorProfiles.ts`

## Problem

Contributor profile identity rules are split across Convex, local frontend data helpers, server public-data helpers, and the save route. Key derivation from email exists in both `convex/lib/contributorProfiles.ts` and `src/data/userProfiles.ts`; profile key normalization and alias matching also exist in multiple places. `src/app/api/save-user-profile/route.ts` normalizes the requested profile key before calling Convex, while Convex independently enforces editability and ownership.

The result is a shallow set of Modules where the caller must know the same identity rules as the storage Implementation. This is real friction because contributor profiles have security semantics: self-profile ownership, alias resolution, membership email binding, and public materialization all depend on consistent key and alias behavior.

## Proposed deepening opportunity

Deepen contributor profile identity into a single domain Module that owns key normalization, email-derived claim keys, alias lookup, membership-email ownership, and public materialization. Convex should be the authoritative Implementation for mutation and ownership decisions. Frontend and server public-data helpers should consume materialized profiles or a generated/shared pure adapter that is tested against the Convex identity Module.

The save route should pass raw user input plus the authenticated actor; it should not pre-decide the canonical key. Public lookup helpers should use a profile lookup Interface that hides exact-vs-alias matching instead of rebuilding matching rules.

## Benefits

- **Module**: contributor identity becomes a coherent Module rather than a set of matching helper names in several files.
- **Interface**: callers request "owned profile", "profile by public key or alias", or "save my profile" without knowing the normalization algorithm.
- **Implementation**: key derivation, alias collapse, membership-email checks, and avatar materialization can change together.
- **Depth**: the Interface becomes small while hiding several security and display invariants.
- **Seam**: the profile lookup/save seam sits at Convex data ownership, with frontend helpers as adapters.
- **Adapter**: React hooks and server public-data helpers adapt materialized profile records to UI needs.
- **Leverage**: one identity rule set serves public contributor pages, report author resolution, about-page founder profiles, and `/dev/profile`.
- **Locality**: bugs in profile claiming or alias resolution are fixed once and verified through one test surface.

## Test plan

- Add tests for email-to-key derivation, including local credential emails and unusual local parts.
- Add Convex tests for claiming an unclaimed derived profile, rejecting another user's claimed profile, and allowing editor/admin edits.
- Add public lookup tests for exact key and alias matches using the same identity Module fixtures.
- Add save-route tests asserting raw payloads are handed to Convex and that route-level validation only handles HTTP concerns like size and avatar MIME type.

## Risk/rollout notes

Profile URLs and aliases are public, so preserve existing key normalization and alias behavior initially. Add fixtures from current production contributor profiles before changing any behavior. If a shared pure adapter is used outside Convex, keep Convex as the source of truth and run contract tests so the adapter cannot drift.
