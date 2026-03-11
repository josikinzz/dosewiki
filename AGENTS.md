# DoseWiki Agent Notes

Last verified: 2026-03-03

## Scope

This repository had no `AGENTS.md` file before this update. This document is the current agent-facing source for safe workflows and reliable commands.

## Current Stack

- Frontend: React + TypeScript + Vite (`src/`)
- Backend/data layer: Convex (`convex/`)
- API routes: Vercel serverless (`api/`)
- Build tooling: Bun + npm scripts (`package.json`)

## Ground Truth Rules

- Convex is the source of truth for live data.
- Local JSON files (for example `src/data/SubstanceIndex.json`) are backup/export artifacts and are not authoritative runtime state.
- Before changing shared content structures, verify schema in `src/schema/substance.schema.ts` and generated helpers in `src/data/schema/`.

## High-Value Paths

- App code: `src/`
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
- `npm run build`
- `npm run build:inline`
- `npm run test`
- `npm run lint`
- `npm run generate:schema`
- `npm run parse:sources`

Common direct script entrypoints:

- `node scripts/batch/batch-generate-<section>.mjs`
- `node scripts/batch/batch-extract-quotes.mjs`
- `node scripts/convex/sync-convex-to-production.mjs`
- `node scripts/migrate/migrate-prompts-to-convex.mjs`

## Prompt System Notes

- Section prompt metadata/types are defined in `src/data/config/sectionPrompts/index.ts`.
- Prompt content is Convex-driven at runtime; static prompt exports in that file are deprecated placeholders.

## Maintenance Checklist

When workflows, scripts, schema shape, or Convex operations change:

1. Update this `AGENTS.md`.
2. Update `README.md` if user-facing docs changed.
3. Update `CLAUDE.md` and relevant `.claude/skills/*/SKILL.md` if operational guidance changed.
