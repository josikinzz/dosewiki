# DoseWiki Agent Notes

Last verified: 2026-03-24

## Scope

This repository had no `AGENTS.md` file before this update. This document is the current agent-facing source for safe workflows and reliable commands.

## Current Stack

- Frontend: Next.js App Router + React + TypeScript (`src/app/`, `src/`)
- Next auth layer: Auth.js with server config in `auth.ts`
- Backend/data layer: Convex (`convex/`)
- API routes: Next route handlers in `src/app/api/`
- Build tooling: Bun + npm scripts (`package.json`)

## Ground Truth Rules

- Convex is the source of truth for live data.
- Convex `memberships` is the source of truth for editor/admin roles in the Next.js auth path.
- Local JSON files (for example `src/data/SubstanceIndex.json`) are backup/export artifacts and are not authoritative runtime state.
- Before changing shared content structures, verify schema in `src/schema/substance.schema.ts` and generated helpers in `src/data/schema/`.

## High-Value Paths

- App code: `src/`
- Auth/config helpers: `auth.ts`, `lib/auth/`
- Next server data helpers: `lib/convex/serverClient.ts`, `lib/convex/publicData.ts`, `lib/next/`
- Convex functions/schema: `convex/`
- Batch generation scripts: `scripts/batch/`
- Migration scripts: `scripts/migrate/`
- Convex sync/import/export scripts: `scripts/convex/`
- Prompt files: `src/data/config/sectionPrompts/`
- Additional script docs: `scripts/README.md`
- Project docs: `README.md`, `CLAUDE.md`

## Verified Commands

From `package.json`:

- `npm run dev`
- `npm run next:dev`
- `npm run build`
- `npm run next:build`
- `npm run start`
- `npm run next:start`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run generate:schema`
- `npm run parse:sources`

Migration note:

- `src/app/` is now the active application shell for development and production builds.
- `src/app/dev` is now protected by Auth.js middleware and Convex-backed roles; bootstrap first admins with `AUTH_ADMIN_EMAILS`.
- Public Next routes should read Convex through the shared server helpers first; keep client Convex hooks for real-time or interaction-heavy surfaces only.
- The Next shell now covers the public route tree for substance, category, effect, mechanism, classification, report, search, contributor, and legacy redirect routes.
- Framework-native SEO for the Next shell now lives in `src/app/sitemap.ts`, `src/app/robots.ts`, and `lib/next/metadata.ts`.
- Protected Next write endpoints now live in `src/app/api/save-substance-index/route.ts`, `src/app/api/save-to-convex/route.ts`, `src/app/api/save-user-profile/route.ts`, and `src/app/api/test-env/route.ts`; they require an Auth.js session plus an `admin` or `editor` role.
- The Next `/dev` “Save to Convex” action now routes through `src/app/api/save-to-convex/route.ts`, which validates the Auth.js editor session server-side and forwards privileged Convex writes with `CONVEX_ADMIN_KEY`.
- `src/app/api/reagent-proxy/route.ts` is the active Next proxy for ProtestKit and keeps the existing public endpoint behavior with rate limiting and CORS handling.
- The Next editor route now lives at `src/app/dev/[[...segments]]/page.tsx` and mounts the existing `DevModePage` inside a Next-specific client/provider shell.
- The Next editor shell needs a readable Convex URL via `NEXT_PUBLIC_CONVEX_URL` or the existing `VITE_CONVEX_URL`.
- When GitHub OAuth is not configured locally, Auth.js can fall back to a development-only credentials provider backed by the legacy password envs so Phase 8 `/dev` work can still be validated.
- Vercel previews and production must include `AUTH_SECRET`; otherwise Next routes that read Auth.js session state will fail at runtime.
- Vercel previews only support real `/sign-in` flows when `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are configured; without them the sign-in page renders a disabled state but `/dev` and protected API handlers should still deny unauthenticated access.
- In the Next `/dev` shell, navigation now goes through the App Router instead of relying on `window.history.pushState` hacks.
- The dev article editor now normalizes legacy and current article section shapes through shared adapters before rendering forms or applying generated YAML.
- Legacy Vercel API entrypoints have been removed; shared GitHub save helpers now live in `lib/server/github/`.
- The legacy Vite shell, offline inline build, and old prerender/sitemap scripts have been retired.

Common direct script entrypoints:

- `node scripts/batch/batch-generate-<section>.mjs`
- `node scripts/batch/batch-extract-quotes.mjs`
- `node scripts/convex/sync-convex-to-production.mjs`
- `node scripts/migrate/migrate-pharmacology-schema.mjs --dry-run --verbose`
- `node scripts/migrate/migrate-prompts-to-convex.mjs`

## Prompt System Notes

- Section prompt metadata/types are defined in `src/data/config/sectionPrompts/index.ts`.
- Prompt content is Convex-driven at runtime; static prompt exports in that file are deprecated placeholders.

## Maintenance Checklist

When workflows, scripts, schema shape, or Convex operations change:

1. Update this `AGENTS.md`.
2. Update `README.md` if user-facing docs changed.
3. Update `CLAUDE.md` and relevant `.claude/skills/*/SKILL.md` if operational guidance changed.
