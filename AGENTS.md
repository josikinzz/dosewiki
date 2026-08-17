# AGENTS.md

## Start Here

- Read [CONTEXT.md](CONTEXT.md) before non-trivial changes.
- For UI work, reuse the [UI kit](docs/ui-kit.md), then follow [.impeccable.md](.impeccable.md) and the [visual style guide](notes-and-plans/guides/dosewiki-visual-style-guide.md). Use the [project visual](docs/assets/dose-wiki-project-guide-stacked-no-context.jpg) as the visual reference.
- For environment or deployment work, use [README environment guidance](README.md#environment-and-deployment) and [deployment routing](docs/agents/deployment.md). Keep credentials out of committed files.

## Hard Invariants

- dose.wiki and Effect Index use this repository, branch, and production Convex data through two Vercel projects. Publication identity and route availability differ by the build-time flavor in `src/config/siteFlavor.ts`; content and data writes can affect both sites.
- Keep `dose.wiki` and `www.dose.wiki` construction-gated through 2026-08-31. Launch after that floor only when the user explicitly authorizes it. Until launch, the full app stays at `https://dosewiki-admin.vercel.app/`.
- All configured Convex reads and writes—including local, development, preview, and production—target `prod:glad-minnow-656`. The Effect Index deployment remains credential-free and read-only. Never configure active work against retired `enchanted-echidna-791`.
- Before a Convex write, run `npm run convex:doctor`, read [Convex credentials](docs/agents/convex-credentials.md), set `TARGET_CONVEX_URL` explicitly, and complete the command's confirmation gates.

## Common Commands

- Install: `bun install --frozen-lockfile` (Bun 1.3.5 owns `bun.lock`).
- Develop: `npm run dev`.
- Inspect the current command surface in `package.json`; `npm run ...` package scripts remain supported.

## Editing Rules

- Treat Convex as runtime truth. Local JSON and Markdown are backups, migration inputs, exports, prompts, or generated artifacts unless active code says otherwise.
- For generated data, check `src/data/artifactLineageManifest.json`, update the producer input, and rerun its recorded command. Do not hand-edit `convex/_generated/` or `src/data/schema/*.generated.ts`.
- For the committed OpenChemLib distribution, follow [fork ownership and verification](docs/architecture/openchemlib-fork.md).

## Verification

- Match verification to scope: `npm run verify:app` for app changes, `npm run verify:workflow` for script/data workflow changes, or `npm run verify:all` when both change.
- After article-schema changes, run `npm run generate:schema` and include the generated helper updates.
- After generated-data or lineage changes, run `npm run provenance:check`.
