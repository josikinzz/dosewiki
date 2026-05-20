# AGENTS.md

## Start Here

- Read [ARCHITECTURE.md](ARCHITECTURE.md) before non-trivial architecture, runtime, or data-flow changes.
- Use [README.md](README.md) for setup, routes, commands, and the human-facing project overview.
- Use [docs/architecture/project-layout.md](docs/architecture/project-layout.md) for code ownership and local artifact hygiene.
- Use [docs/architecture/runtime-and-data.md](docs/architecture/runtime-and-data.md) for Convex, Auth.js, runtime, and integration details.
- Use [docs/architecture/operations-and-direction.md](docs/architecture/operations-and-direction.md) for quality gates, known debt, and direction.
- For UI/frontend work, follow the [dose.wiki visual style guide](notes-and-plans/guides/dosewiki-visual-style-guide.md).
- For scripts, use [scripts/README.md](scripts/README.md).

## Hard Invariants

- Convex is authoritative for live runtime data.
- Convex `memberships` controls `/dev` editor/admin roles.
- Convex `contributorProfiles` controls public contributor profiles and self-profile ownership.
- Local JSON/markdown data under `src/data/` is backup, seed, migration, export, or prompt material unless code clearly treats it otherwise.
- Do not directly edit local JSON to fix live article data; fetch from Convex, mutate through the app/API/script path, then sync if production needs the change.
- Keep `editorial_review` as editor-only metadata. Do not render it as public article content.
- Article/editor write routes require authenticated `admin` or `editor`; `/dev/profile` and `save-user-profile` allow any authenticated user but must enforce self-profile ownership.
- Do not reintroduce legacy Vercel `api/*.js` entrypoints; shared GitHub write helpers live in `lib/server/github/`.

## Key Paths

- App routes and route handlers: `src/app/`
- Protected editor shell: `src/app/dev/[[...segments]]/page.tsx`, `src/features/dev/`
- Auth and role helpers: `auth.ts`, `middleware.ts`, `lib/auth/`
- Server Convex reads/writes: `lib/convex/`
- Article schema: `src/schema/substance.schema.ts`
- Generated schema helpers: `src/data/schema/`
- Convex functions/schema: `convex/`
- Batch generation: `scripts/batch/`
- Prompt metadata/content: `src/data/config/sectionPrompts/`
- Convex import/export/sync: `scripts/convex/`
- Migrations and source parsers: `scripts/migrate/`, `scripts/parsers/`, `scripts/parse-sources.ts`

## Editing Rules

- Before changing article shape or generated fields, inspect `src/schema/substance.schema.ts`; after schema changes run `npm run generate:schema`.
- Do not hand-edit generated files in `convex/_generated/`, `src/data/schema/*.generated.ts`, or `src/data/schema/fieldRegistry.generated/`; manual overrides under `src/data/schema/fieldOverrides/` are domain-owned.
- Public App Router pages should prefer shared server Convex helpers in `lib/convex/`; use client Convex hooks only for live or interaction-heavy UI.
- Protected writes should go through Auth.js-guarded App Router handlers in `src/app/api/`.
- Prompt edits are Convex-driven at runtime; compare or migrate with `npm run prompts:compare` and `npm run prompts:migrate`.
- Prompt drift policy and local/Convex prompt inventory live in `scripts/lib/prompt-drift-policy.mjs`; compare output includes both `generator` and `section_*` prompt keys.
- Data artifact roles, inputs, refresh commands, and edit policy are tracked in `src/data/artifactLineageManifest.json`; volatile run metadata is emitted to ignored sidecars under `src/data/.lineage/`.
- Data operation scripts under `scripts/convex/`, `scripts/migrate/`, `scripts/prepopulate/`, and `scripts/citations/` should resolve targets, dry-run/write mode, local artifact mode, and destructive confirmations through `scripts/lib/data-ops-run-context.mjs`.
- Destructive data operations must print their source, target, selected tables, and local artifact scope before writing, and require the operation-specific confirmation flag from the shared data ops run-context module.
- After batch generation or other dev Convex writes that should go live, sync to production with `npm run convex:sync-production -- --confirm-production-sync`.

## Runtime Notes

- `/dev` uses `src/app/dev/[[...segments]]/page.tsx` and App Router navigation.
- `/dev` needs `NEXT_PUBLIC_CONVEX_URL` or `VITE_CONVEX_URL` for browser-side Convex reads.
- Public server reads may use `CONVEX_PUBLIC_READ_URL` to mirror production while editor writes continue using the configured write deployment.
- Runtime env contract diagnostics live in `lib/runtime/envContract.ts` and start in report-only mode.
- Convex runtime target capability policy lives in `lib/convex/runtimeTargets.ts`; privileged writes and auth membership sync prefer `CONVEX_URL` and report compatibility warnings when falling back to browser-exposed variables.
- Protected Convex write endpoints need `CONVEX_ADMIN_KEY`.
- Workflow scripts that write to a non-default deployment should use `TARGET_CONVEX_URL`.
- OpenRouter-backed batch generation needs `OPENROUTER_API_KEY`.
- Vercel preview/production must have `AUTH_SECRET`; real GitHub sign-in also needs `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
- If GitHub OAuth is missing locally, Auth.js can use the development-only credentials fallback.

## Common Commands

```bash
npm run dev
npm run build
npm run start
npm run test
npm run lint
npm run typecheck
npm run generate:schema
npm run parse:sources
npm run hygiene:check
npm run hygiene:clean
npm run test:workflow
```

Stable workflow commands:

```bash
npm run batch:summary -- --all --concurrency=2
npm run batch:extract -- --category=legality --resume
npm run batch:legality -- --dry-run
npm run citations:formal -- --slug=2c-b --dry-run
npm run prompts:compare
npm run prompts:migrate
npm run convex:sync-production -- --confirm-production-sync
```

## Validation

- For meaningful app changes, run the narrow relevant tests first, then `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build` before shipping.
- For script/workflow changes, run `npm run test:workflow` and `npm run lint:scripts`.
- For article schema changes, run `npm run generate:schema` and include generated helper updates.
- `npm run provenance:check` is informational/report-only by default.
