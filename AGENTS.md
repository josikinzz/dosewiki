# AGENTS.md

## Start Here

- Read [CONTEXT.md](CONTEXT.md) for the canonical vocabulary before non-trivial changes.
- For replication classification, taxonomy, promotion, or gallery intake, follow the [replication classification field guide](docs/agents/replication-classification-guide.html). For reviewed Reddit archive media moving through R2, Postgres, and public sites, follow the [Reddit replication intake runbook](docs/agents/reddit-replication-intake.md).
- For flat-body trip reports, follow the [timeline runbook](docs/agents/trip-report-timeline.md) so the reshape stays lossless. For `zh.dose.wiki` translation storage, cron, or operator work, follow the [locale mirrors runbook](docs/agents/locale-mirrors.md).
- For `/sectionmaxxing`, follow the [sectionmaxxing skill](.agents/skills/sectionmaxxing/SKILL.md). It regenerates five non-legality narrative sections on URL-only and hidden articles with isolated Sol-low workers; publishing stays separately approved. It is not the `citation-pi` entailment audit.
- For molecule editing or rendering, follow [molecule editor notes](src/features/dev/tools/molecule-editor/NOTES.md) and [OpenChemLib fork ownership](docs/architecture/openchemlib-fork.md).
- For UI work, reuse the portable [UI kit](docs/ui-kit.md) and [visual style guide](notes-and-plans/guides/dosewiki-visual-style-guide.md). Use the [project visual](docs/assets/dose-wiki-project-guide-stacked-no-context.jpg) as the visual reference.
- For environment or deployment work, use [README build, run, and deploy guidance](README.md#build-run-and-deploy) and [deployment routing](docs/agents/deployment.md). Keep credentials out of committed files.
- For generated data, inspect `src/data/artifactLineageManifest.json`, change the producer input, and run its recorded command. Never hand-edit `lib/postgres/schema.generated.ts`, `lib/postgres/runtime/{dataModel.ts,api.generated.ts,functions.generated.ts}`, `src/data/schema/*.generated.ts`, or generated migration metadata. Native callable ownership lives in `lib/postgres/runtime/functionOwnership.json`; `server/` contains authored Postgres handlers, not generated functions. Obsolete Convex bindings are retained only under `scripts/recovery/convex/_generated/*.reference`.
- Accounts: run `account-scope why` before `gh`, `vercel`, or `git push` — it names this repo's GitHub/Vercel account.

## Hard Invariants

- PlanetScale Postgres is production runtime truth. The archived Convex service `glad-minnow-656` is a frozen, non-runtime recovery source during the ticket 24 observation window, never a routine operator target. Never write Convex in normal operation. Any rollback write is owner-gated and follows [the recovery procedure](notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex).
- Production data commands use `DATA_BACKEND=postgres`, an explicit `--target` or `TARGET_POSTGRES_URL`, and every guard named by the command. A dry run is not authorization. Implementing a guarded command does not add it to the operator-write allowlist. See [data credentials](docs/agents/data-credentials.md).
- `DATA_WRITES_FROZEN=1` must fail closed at every write boundary. Never weaken the freeze, explicit-target checks, confirmation phrases, role checks, or intent-scoped credential selection.
- Public DoseWiki, editor DoseWiki, and Effect Index are separate build artifacts and Vercel projects. `dosewiki-public` serves `dose.wiki` and `www.dose.wiki`; `dosewiki-admin` serves `dev.dose.wiki` and `dosewiki-admin.vercel.app`; Effect Index uses its own read-only flavor. See [deployment routing](docs/agents/deployment.md).
- DoseWiki owns the replication embed used by Osmanthus. `/embed/replications` reuses `ReplicationShowcase` and `ReplicationViewerOverlay`; keep the versioned contract in `HANDOFF.md`, framing policy in `lib/next/replicationEmbedPolicy.ts`, public-build editorial isolation, and publisher-first release order.
- Public and Effect Index artifacts carry no admin key or editorial browser modules. Only the editor deployment may carry the write credential tier. `REPLICATION_MEDIA_BASE_URL` is required for Postgres runtime reads.
- Write links as App Paths. `/preview` exists only for permanent compatibility redirects. Public editor, review, and sign-in links hand off to `dev.dose.wiki`.
- Preserve Auth.js identity, database-backed roles, service-write allowlists, content ownership, revision checks, human editorial authority, and recovery history. Never infer authorization from a credential alone.
- Local source changes are not deployed changes. Never claim production state without deployment evidence.
- The local native source contract uses `DATA_ADMIN_KEY` and `DATA_ADMIN_TOKEN_*` without `CONVEX_ADMIN_*` aliases. Source cutover does not rename provider configuration or authorize release, migration, storage CORS changes, or retirement. Follow the completion follow-up gates in the [release manifest](notes-and-plans/plans/convex-to-planetscale/release-manifest.md#completion-dossier-follow-up-local-source-only).

## Commands and Verification

- Install with `bun install --frozen-lockfile`; Bun 1.3.5 owns `bun.lock`.
- `package.json` is the executable command catalog. Use the narrow verification command for the changed surface.
- Never delete `.next` as a build-fix reflex; `.next/cache` contains the persistent data cache.
- Routing, middleware, and build-config work must be checked with a production-shaped build or deployment because middleware does not run under `next dev`.

## Style

- Em dashes are banned in all text.
