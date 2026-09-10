# AGENTS.md

## Start Here

- Read [CONTEXT.md](CONTEXT.md) for the canonical vocabulary before non-trivial changes.
- For replication intake, gallery classification, taxonomy, or promotion, follow the [replication classification field guide](docs/agents/replication-classification-guide.html).
- For Reddit archive media moving from reviewed local evidence through R2, Convex, and both public sites, follow the [Reddit replication intake runbook](docs/agents/reddit-replication-intake.md).
- For UI work, reuse the [UI kit](docs/ui-kit.md), then follow [.impeccable.md](.impeccable.md) and the [visual style guide](notes-and-plans/guides/dosewiki-visual-style-guide.md). Use the [project visual](docs/assets/dose-wiki-project-guide-stacked-no-context.jpg) as the visual reference.
- For environment or deployment work, use [README environment guidance](README.md#environment-and-deployment) and [deployment routing](docs/agents/deployment.md). Keep credentials out of committed files.
- For a trip report submitted as one flat body, follow the [trip report timeline runbook](docs/agents/trip-report-timeline.md) so the reshape stays lossless.
- For `/sectionmaxxing` or `/goal continue the sectionmaxxing process till completion`, follow the [sectionmaxxing skill](.agents/skills/sectionmaxxing/SKILL.md). It regenerates five non-legality narrative sections on every URL-only/hidden article with isolated Sol-low workers; it is not the `citation-pi` entailment audit.

## Hard Invariants

- dose.wiki and Effect Index use this repository, branch, and production Convex data through two Vercel projects. Publication identity and route availability differ by the build-time flavor in `src/config/siteFlavor.ts`; content and data writes can affect both sites.
- `dose.wiki` and `www.dose.wiki` are the launched public hosts. One `dosewiki-admin` production build also serves `dev.dose.wiki` and `dosewiki-admin.vercel.app`; those two editor hosts remain closed to crawlers.
- Write public links as App Paths (`/2c-b`). The retired `/preview` addresses permanently redirect to App Paths and must never appear in new hrefs. Public-host editor, review, and sign-in links hand off to `dev.dose.wiki`; credentialed editor APIs remain unavailable on the public origin.
- DoseWiki owns the canonical public replication carousel and immersive viewer for Osmanthus too. `/embed/replications` must render the existing `ReplicationShowcase` and `ReplicationViewerOverlay`, not a second implementation. Keep its versioned message contract in `HANDOFF.md`, exact-origin framing policy in `lib/next/replicationEmbedPolicy.ts`, and public-build editorial isolation intact. Publisher UI releases update the embedded consumer at runtime; never introduce a consumer-side playback fork. Deploy the publisher endpoint before a consumer cutover.
- All configured Convex reads and writes—including local, development, preview, and production—target `prod:glad-minnow-656`. The Effect Index deployment remains credential-free and read-only. Never configure active work against retired `enchanted-echidna-791`.
- Before a Convex write, run `npm run convex:doctor`, read [Convex credentials](docs/agents/convex-credentials.md), set `TARGET_CONVEX_URL` explicitly, and complete the command's confirmation gates.
- PlanetScale: org `disregardeverythingisay`, database `dosewiki`, branch `main`, engine Postgres. It is the migration target of [the Convex to PlanetScale plan](notes-and-plans/plans/convex-to-planetscale/decisions.md), not runtime truth; Convex stays authoritative until that plan's ticket 23 cutover. Agents may run read-only SQL against it. Writes go only through `npm run postgres:migrate`, `npm run postgres:import`, and `npm run postgres:rehearse-publication` (scratch rows it deletes), each with `--allow-remote` and `POSTGRES_IMPORT_CONFIRM` set. Schema changes outside versioned migrations, Traffic Control, webhooks, and role or credential creation require owner approval. Connection URLs live in `.env.local` only.
- `DATA_BACKEND=postgres` runs the unchanged `convex/` functions in-process against Postgres (`lib/postgres/runtime/`). It is explicit only: any other value means Convex, so a preview build never inherits a Postgres writer. Such a process MUST carry the Convex deployment variables the handlers read from `process.env` (`npx convex env list`); `lib/postgres/runtime/deploymentEnv.ts` refuses to start without `REPLICATION_MEDIA_BASE_URL`, because a missing media base URL makes the public gallery silently drop most of its rows. `CONVEX_ADMIN_KEY` and `GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT` belong only to a writing deployment: on Postgres the admin key is the write credential, so the read-only public and Effect Index deployments must never carry it. Never hand-edit `lib/postgres/schema.generated.ts`, `lib/postgres/runtime/functions.generated.ts`, or `lib/postgres/migrations/`: regenerate with `npm run generate:postgres-schema`, `npm run generate:postgres-functions`, and `npm run postgres:migrate:generate`.

## Common Commands

- Install: `bun install --frozen-lockfile` (Bun 1.3.5 owns `bun.lock`).
- Inspect the current command surface in `package.json`; `npm run ...` package scripts remain supported.

## Editing Rules

- Treat Convex as runtime truth. Local JSON and Markdown are backups, migration inputs, exports, prompts, or generated artifacts unless active code says otherwise.
- For generated data, check `src/data/artifactLineageManifest.json`, update the producer input, and rerun its recorded command. Do not hand-edit `convex/_generated/` or `src/data/schema/*.generated.ts`.
- For the committed OpenChemLib distribution, follow [fork ownership and verification](docs/architecture/openchemlib-fork.md).
- Treat `/preview` as a compatibility-only pre-launch prefix. `middleware.ts` may parse it to issue a permanent redirect; client route state must use ordinary App Paths.

## Verification

- Match verification to scope: `npm run verify:fast` (tests + typecheck) for ordinary app-code changes, `npm run verify:app` when routing, middleware, or build config change, `npm run verify:workflow` for script/data workflow changes, or `npm run verify:all` when both change.
- Never delete `.next` as a build-fix reflex: `.next/cache` holds the persistent Convex data cache, the difference between a ~1 minute warm build and a ~4 minute cold one.
- After article-schema changes, run `npm run generate:schema` and include the generated helper updates.
- After generated-data or lineage changes, run `npm run provenance:check`.
- Verify host- and middleware-shaped work against `npm run build && npx next start` or a deployment: middleware never runs under `next dev`, so a dev-server check passes without executing it.
- When adding a test, follow the [test ownership policy](docs/architecture/operations-and-direction.md#test-ownership-policy): one contract at its lowest stable layer, no source-text scans outside named architecture policies, no workstation-gated skips. Vendored OpenChemLib changes run `npm run openchemlib:test`.

## Style

- Em dashes are banned in all text because they read as AI slop.
