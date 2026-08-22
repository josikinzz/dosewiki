# AGENTS.md

## Start Here

- Read [CONTEXT.md](CONTEXT.md) for the canonical vocabulary before non-trivial changes.
- For UI work, reuse the [UI kit](docs/ui-kit.md), then follow [.impeccable.md](.impeccable.md) and the [visual style guide](notes-and-plans/guides/dosewiki-visual-style-guide.md). Use the [project visual](docs/assets/dose-wiki-project-guide-stacked-no-context.jpg) as the visual reference.
- For environment or deployment work, use [README environment guidance](README.md#environment-and-deployment) and [deployment routing](docs/agents/deployment.md). Keep credentials out of committed files.
- For a trip report submitted as one flat body, follow the [trip report timeline runbook](docs/agents/trip-report-timeline.md) so the reshape stays lossless.

## Hard Invariants

- dose.wiki and Effect Index use this repository, branch, and production Convex data through two Vercel projects. Publication identity and route availability differ by the build-time flavor in `src/config/siteFlavor.ts`; content and data writes can affect both sites.
- Keep the Construction Hosts (`dose.wiki`, `www.dose.wiki`) gated through 2026-08-31 — a floor, not a trigger; launch only on explicit user authorization. They answer the Holding Page at `/` and serve the finished site under the Preview Address Space (`/preview/home`, `/preview/substances`), while `dosewiki-admin.vercel.app` serves it unprefixed. One production build feeds all three, so `middleware.ts` is the whole gate: fix routing bugs inside it rather than by relaxing it.
- Write links as App Paths (`/2c-b`). Middleware redirects a bare path into the Preview Address Space, so a hand-prefixed href only bakes a pre-launch address into permanent markup. The editor, review workbench, sign-in and credentialed APIs have no address there.
- All configured Convex reads and writes—including local, development, preview, and production—target `prod:glad-minnow-656`. The Effect Index deployment remains credential-free and read-only. Never configure active work against retired `enchanted-echidna-791`.
- Before a Convex write, run `npm run convex:doctor`, read [Convex credentials](docs/agents/convex-credentials.md), set `TARGET_CONVEX_URL` explicitly, and complete the command's confirmation gates.

## Common Commands

- Install: `bun install --frozen-lockfile` (Bun 1.3.5 owns `bun.lock`).
- Inspect the current command surface in `package.json`; `npm run ...` package scripts remain supported.

## Editing Rules

- Treat Convex as runtime truth. Local JSON and Markdown are backups, migration inputs, exports, prompts, or generated artifacts unless active code says otherwise.
- For generated data, check `src/data/artifactLineageManifest.json`, update the producer input, and rerun its recorded command. Do not hand-edit `convex/_generated/` or `src/data/schema/*.generated.ts`.
- For the committed OpenChemLib distribution, follow [fork ownership and verification](docs/architecture/openchemlib-fork.md).
- Derive client route identity with `toAppPath()` ([`src/utils/previewPath.ts`](src/utils/previewPath.ts)). The browser keeps the `/preview` prefix, so a raw `usePathname()` comparison fails silently in every chrome, active-tab and route-shape branch.

## Verification

- Match verification to scope: `npm run verify:app` for app changes, `npm run verify:workflow` for script/data workflow changes, or `npm run verify:all` when both change.
- After article-schema changes, run `npm run generate:schema` and include the generated helper updates.
- After generated-data or lineage changes, run `npm run provenance:check`.
- Verify host-, gate- and Preview-shaped work against `npm run build && npx next start` or a deployment: middleware never runs under `next dev`, so a dev-server check passes without executing it.
