# Next + Auth.js + Convex Contributor Guide

This project now has one primary application path: `Next.js` App Router in `src/app/`.

## Core Rules

- Public pages render through Next route segments in `src/app/`.
- Auth.js owns browser identity and session handling.
- `lib/auth/runtimePolicy.ts` owns active auth mode, provider readiness, Auth.js secret resolution, and editor credentials availability.
- Convex remains the live data source and business layer.
- Convex `memberships` is the source of truth for `admin` / `editor` / `viewer` roles.
- Local JSON files are backup or export artifacts, not the authoritative runtime source.

## Main Entry Points

- App shell: `src/app/layout.tsx`
- Auth config: `auth.ts`
- Middleware: `middleware.ts`
- Protected API handlers: `src/app/api/`
- Shared server GitHub write helpers: `lib/server/github/`
- Public Convex server reads: `lib/convex/serverClient.ts`, `lib/convex/publicData.ts`

## Public Route Work

- Prefer server components for public route framing and data loading.
- Use `lib/next/metadata.ts` for public metadata behavior.
- Add new crawlable routes under `src/app/`, not under a client-side router.

## Editor/Auth Work

- Protect `/dev` through Auth.js session checks and role checks.
- Guard protected writes at the server boundary with `requireEditorSession`.
- Do not reintroduce password-only browser auth or Vercel `api/*.js` entrypoints.
- For Vercel previews or production, set `AUTH_SECRET` or Auth.js-backed routes will fail in production mode.
- Real preview sign-in can use server-side editor password env vars such as `ADMIN_PASSWORD`, `JOSIE`, or keys listed in `DEV_PASSWORD_KEYS`.
- GitHub OAuth is optional; set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` only when that provider should be available.

## Data Work

- Treat `glad-minnow-656` as the sole Convex source of truth. Point every active
  read and write URL at it; do not mirror production into another deployment.
- Reuse existing schema helpers before introducing new cross-boundary validators.
- Keep Zod at real runtime boundaries rather than duplicating schemas unnecessarily.

## Commands

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run test`
- `npm run lint`
- `npm run typecheck`

## Current Deferred Debt

- Some shared routing helpers still exist because Next client surfaces reuse them for internal path generation.
- End-to-end preview role verification still requires a real browser sign-in against the live Auth.js provider.
