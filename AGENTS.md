# AGENTS.md

## Start Here

- Read [CONTEXT.md](CONTEXT.md) before non-trivial changes.
- For UI work, reuse the [UI kit](docs/ui-kit.md), then follow [.impeccable.md](.impeccable.md) and the [visual style guide](notes-and-plans/guides/dosewiki-visual-style-guide.md). Use the [project visual](docs/assets/dose-wiki-project-guide-stacked-no-context.jpg) as the visual reference.
- For environment or deployment work, use [README environment guidance](README.md#environment-and-deployment) and [deployment routing](docs/agents/deployment.md). Keep credentials out of committed files.
- For a trip report submitted as one flat body, follow the [trip report timeline runbook](docs/agents/trip-report-timeline.md) so the reshape stays lossless.

## Hard Invariants

- dose.wiki and Effect Index use this repository, branch, and production Convex data through two Vercel projects. Publication identity and route availability differ by the build-time flavor in `src/config/siteFlavor.ts`; content and data writes can affect both sites.
- Keep `dose.wiki` and `www.dose.wiki` construction-gated through 2026-08-31. Launch after that floor only when the user explicitly authorizes it. Until launch those hosts serve the holding page at `/` and the finished site under the `/preview` prefix (`/preview/home`, `/preview/substances`, …), while `https://dosewiki-admin.vercel.app/` serves it unprefixed. All three hosts come off the same production build: the gate lives in `middleware.ts`, not in the deployment or the domain routing, so never weaken it to fix a routing bug.
- On the gated hosts a bare non-allowlisted path redirects *into* the prefix (`/2c-b` → `/preview/2c-b`); that redirect is what lets ordinary unprefixed `href`s work there, so write links as `/2c-b`, never `/preview/2c-b`. The editor, review workbench, sign-in and credentialed APIs have no preview address on any host and still bounce to `/`.
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
- Client route identity comes from `toAppPath()` ([`src/utils/previewPath.ts`](src/utils/previewPath.ts)), not from `usePathname()` directly. Under `/preview` the browser keeps the prefix, so a raw pathname comparison silently fails every chrome, active-tab and route-shape branch.

## Verification

- Match verification to scope: `npm run verify:app` for app changes, `npm run verify:workflow` for script/data workflow changes, or `npm run verify:all` when both change.
- After article-schema changes, run `npm run generate:schema` and include the generated helper updates.
- After generated-data or lineage changes, run `npm run provenance:check`.
- Middleware never runs under `next dev`. Anything host-, gate- or `/preview`-shaped MUST be checked against `npm run build && npx next start` or a deployment; a dev-server check passes without exercising the code at all.
