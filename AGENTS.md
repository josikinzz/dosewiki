# AGENTS.md

## Start Here

- Read [README.md](README.md) for the human-facing project overview.
- Read [CONTEXT.md](CONTEXT.md) before non-trivial changes.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before architecture, runtime, or data ownership changes.
- Note that `CONTEXT.md` is currently citation-focused; use README and architecture docs for general app context.
- For folder ownership and generated artifact hygiene, use [docs/architecture/project-layout.md](docs/architecture/project-layout.md).
- For runtime data flow and integration boundaries, use [docs/architecture/runtime-and-data.md](docs/architecture/runtime-and-data.md).
- For UI/frontend work, start with the **UI Kit**: read [docs/ui-kit.md](docs/ui-kit.md) and browse the live catalog at `/dev/kit`. Reuse the shared components there before building anything new. Then follow [.impeccable.md](.impeccable.md) and [notes-and-plans/guides/dosewiki-visual-style-guide.md](notes-and-plans/guides/dosewiki-visual-style-guide.md).
- Repo-local Codex skills live under `.agents/skills/`; see [docs/agents/skill-packs.md](docs/agents/skill-packs.md) and use `.agents/skills/scry/SKILL.md` when the user invokes `/scry`.
- Citation-workbench details live in [docs/agents/citation-workbench.md](docs/agents/citation-workbench.md); read it only for citation workflow, workbench, or citation rollout tasks.
- For GitHub/Vercel deployment/account routing, read [docs/agents/deployment.md](docs/agents/deployment.md).
- Script details live in [scripts/README.md](scripts/README.md).

## Hard Invariants

- `dose.wiki` and `www.dose.wiki` are public under-construction hosts only. Do not deploy, alias, or configure them to expose the full app. The full website/editor surface belongs on the admin Vercel host (`dosewiki-admin.vercel.app` / project-generated admin URLs) unless the user explicitly asks to launch the public site.
- Convex is authoritative for live runtime content. Do not fix public article data by hand-editing local JSON.
- Public App Router pages should read through server-side Convex helpers in `lib/convex/` and `lib/next/`.
- Client-side Convex hooks are for `/dev` editor flows and interaction-heavy surfaces, not bulk public page bootstrapping.
- The canonical substance article contract is `src/schema/substance.schema.ts`; regenerate schema helpers after source schema changes.
- Do not hand-edit generated files in `convex/_generated/` or `src/data/schema/*.generated.ts`.
- Do not reintroduce `src/data/SubstanceIndex.json` as the public rendering source.
- Protected editor and API writes must keep Auth.js session checks, Convex membership roles, rate limits, and server-side secret handling intact.
- Keep secrets out of tracked files. Use `.env.local` or shell environment for admin keys, Convex URLs, OpenRouter keys, GitHub tokens, and OAuth secrets.
- Keep `editorial_review` as editor-only metadata. Do not render it as public article content.
- Citation writes require reviewed workbench draft output plus the explicit `--write --confirm-citation-write` flow.

## Common Commands

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
npm run lint:api
npm run lint:scripts
npm run typecheck
npm run typecheck:scripts
npm run typecheck:convex
npm run generate:schema
npm run provenance:check
npm run features:reachability
npm run hygiene:check
```

Common workflow environment variables: `CONVEX_ADMIN_KEY`, `OPENROUTER_API_KEY`, `SCRY_API_KEY`, `VITE_CONVEX_URL`, `CONVEX_PUBLIC_READ_URL`, and `TARGET_CONVEX_URL`. Keep values in `.env.local` or shell environment; never commit secrets.

## Editing Rules

- Prefer existing feature, route, Convex, script, and schema patterns over new cross-cutting abstractions.
- Build UI from the shared kit (`src/components/ui`, `src/components/common`, `src/components/layout`). Check `docs/ui-kit.md` and the `/dev/kit` catalog first; do not hand-roll a button, card, badge, input, or surface that already exists. New shared primitives must be registered in the catalog — `src/app/dev/kit/registry/completeness.test.ts` fails the build otherwise.
- Keep shared UI promotion intentional: feature recipes stay beside their consuming feature until they have multiple real consumers and a stable API.
- Update `ARCHITECTURE.md`, README, script docs, or targeted docs when changing durable workflow, runtime ownership, schema ownership, or editor/save paths.
- Leave unrelated dirty-worktree changes alone. Work with them only if they directly affect the task.
- Do not treat `.next/`, `dist/`, `dist-inline/`, `coverage/`, `archive/`, or `notes-and-plans/` as active runtime source unless the task explicitly targets them.

## Validation

- App/UI changes: run the focused Vitest target when available, then `npm run lint`, `npm run typecheck`, and `npm run build` for meaningful changes.
- API route changes: include `npm run lint:api`.
- Script/workflow changes: run `npm run lint:scripts`; broaden to `npm run test:workflow` when shared data-ops behavior changes.
- Convex/schema changes: inspect `src/schema/substance.schema.ts`, run `npm run generate:schema`, `npm run typecheck:convex`, and include generated helper updates.
- Generated data changes: run `npm run provenance:check`.
- Citation adapter/rendering changes: start with the focused tests listed in [docs/agents/citation-workbench.md](docs/agents/citation-workbench.md).
- Do not run broad suites for documentation-only edits unless another changed file needs them.
