# API/Auth Role Policy Module

## Files

- `auth.ts`
- `middleware.ts`
- `src/lib/auth/roles.ts`
- `src/lib/auth/requireEditorSession.ts`
- `src/lib/auth/requireAuthenticatedSession.ts`
- `lib/auth/convexMemberships.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/app/dev/[[...segments]]/page.tsx`

## Problem

Role semantics are defined in more than one place. `src/lib/auth/roles.ts` owns `APP_ROLES` and `canAccessDev`, while `middleware.ts` has its own `isAppRole` and `canAccessDev`. `auth.ts` assigns a development credentials user the `admin` role directly, while `lib/auth/convexMemberships.ts` syncs GitHub users through Convex memberships. Route guards then consume the session role, and `/dev/profile` has an exception in middleware that allows authenticated users without editor access.

The role policy Module is shallow because the Interface is a set of helpers plus duplicated checks. A maintainer has to inspect middleware, Auth.js callbacks, Convex membership sync, and route guards to answer simple questions such as "who can enter `/dev`?", "who can save a profile?", and "where does development admin status come from?"

## Proposed deepening opportunity

Create a single role policy Module used by Auth.js callbacks, middleware, route guards, and profile exceptions. Its Interface should expose intent-level decisions such as `canAccessDevShell`, `canUseEditorWriteRoute`, `canUseSelfProfileRoute`, and `resolveSessionRole`. The Implementation can still use Convex memberships, legacy credentials, and session tokens, but consumers should not duplicate role literals or profile-route exceptions.

Middleware should become an adapter that asks the role policy Module for a routing decision. Route guards should ask for operation authorization decisions. `auth.ts` should delegate development credential role assignment through the same policy Module so the development-only adapter is explicit.

## Benefits

- **Module**: gives role policy one Module instead of scattered literals and helper copies.
- **Interface**: consumers ask intent-shaped questions instead of checking `admin`, `editor`, or `viewer` directly.
- **Implementation**: route exceptions, legacy credential behavior, and membership-derived roles stay behind the Module.
- **Depth**: the Interface is small, but it hides the interaction between session tokens, Convex memberships, development credentials, and `/dev/profile`.
- **Seam**: middleware, Auth.js, and App Router routes share the role-policy seam without sharing HTTP-specific code.
- **Adapter**: middleware adapts token data, Auth.js adapts provider data, and route guards adapt server sessions into the same policy.
- **Leverage**: adding a future role or narrowing profile access changes one policy Module.
- **Locality**: authorization knowledge becomes local to the policy Module instead of spread across the request path.

## Test plan

- Add table-driven tests for all role-policy decisions: anonymous, viewer, editor, admin, invalid token role, and development credential user.
- Add middleware tests for `/dev`, `/dev/profile`, `/dev/profiles`, and non-`/dev` paths using the shared policy.
- Add route guard tests proving editor-only routes reject viewers while authenticated profile routes permit self-profile flow.
- Add an Auth.js callback test or focused helper test proving legacy credential role resolution remains development-only as intended.

## Risk/rollout notes

The biggest risk is accidentally changing `/dev/profile` access or development credential behavior. Start by moving duplicated functions without changing decisions, then replace call sites. Keep role literals exported for type compatibility during the transition, but make intent helpers the preferred Interface.
