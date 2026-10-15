# AGENTS.md

dose.wiki is an open encyclopedia of psychoactive substances for harm reduction, research, and education. This public repository is the Next.js application behind dose.wiki and its Effect Index publication. Errors in published dosage, interaction, or legality data can hurt readers, which is why most rules below guard writes and published content.

## Rules

"Judgment" marks a rule that no check enforces. Nothing fails when you skip it, so read those rows before you act.

| Rule | Enforced by |
| --- | --- |
| PlanetScale Postgres is the only runtime and the source of truth. Files under `data/` and `content/` are seeds and exports, never the live record. | `requirePostgresBackend` in `lib/postgres/runtime/target.ts` throws unless `DATA_BACKEND=postgres`. No other backend exists. |
| A production write needs `DATA_BACKEND=postgres`, an explicit `--target` or `TARGET_POSTGRES_URL`, and every confirmation the command names. Follow [data credentials](docs/operations/data-credentials.md). | `authorizeProductionWrite` in `scripts/lib/production-write-command.mjs`, the allowlist in `scripts/lib/production-writer-inventory.mjs`, and `scripts/postgres/targetGuard.ts` |
| A dry run or a passing guard is not authorization. A human approves each production write. | Judgment |
| `DATA_WRITES_FROZEN=1` fails closed at every write boundary. Never weaken the freeze, target checks, confirmation phrases, or role checks. | `assertDataWritesNotFrozen` in `lib/runtime/dataWriteFreeze.ts`, the `pureFreezeImports` restriction in `eslint.config.mjs`, and CI running with `DATA_WRITES_FROZEN: "1"`. Weakening a guard: judgment. |
| Public, editor, and Effect Index builds are separate artifacts. Only the editor build carries write credentials or editorial browser modules. | `scripts/build/editor-artifact-audit.mjs`, which `bun run build` runs on Vercel builds and in the `release-build` job. Pull request CI does not build. |
| Authorization comes from an Auth.js session plus the current `memberships` role, never from a credential alone. | `protectedRouteOperation` in `src/lib/http/protectedRouteOperation.ts` requires an `auth` floor. `requireRole` in `server/lib/auth.ts` and `roleMeetsFloor` in `src/lib/auth/roles.ts` check it. |
| Sign-in is username and password against `memberships`. Do not add password-only browser auth or OAuth providers. | `lib/auth/authOptions.ts` registers only `CredentialsProvider`. Adding a provider: judgment. |
| Article saves carry the revision the editor loaded, and a stale save fails. | `baseHash` checks in `server/lib/articleWrite.ts` and `server/saveArticleBatch.ts` |
| Only a human editor sets review status. Agent review writes only advisory flags ([ADR 0003](docs/adr/0003-advisory-review-flags.md)). | The review workflow writes through `replaceAgentReviewFlagsForArticle` in `server/substanceIndex.ts`, which replaces agent flags and cannot change review status. |
| Never commit credentials, credential-bearing URLs, or `.env` files other than `.env.example`. | `scripts/security/scan-secrets.mjs` in `.husky/pre-commit` (`--staged`) and CI (`--tracked`). `.husky/pre-commit` and the CI step "Check .env files not committed" reject `.env` files. |
| Add each new environment variable to `.env.example`. | Judgment |
| Never commit personal data, private contact details, visitor addresses, private hostnames, or workstation paths. Use reserved example identities in tests and docs. | Judgment. `scan-secrets.mjs` finds credential shapes only. |
| If a secret or private record enters Git, stop publishing and report only its location and a redacted fingerprint. Removing it from the latest tree is not enough. The owner decides on revocation and history cleanup. | Judgment |
| Workflows for public or Effect Index builds never receive write-tier secrets such as `DATA_ADMIN_KEY` or write-grant database URLs. | Judgment. The `release-build` job in `.github/workflows/vercel-policy-checks.yml` uses only `POSTGRES_POOLED_READONLY_URL`. |
| Never hand-edit a file that `data/lineage.json` marks `do-not-edit-by-hand`. Change the producer input and run its `refreshCommand`. | CI runs `bun run postgres:check-schema`, `bun run postgres:verify-migrations`, and `scripts/build/check-function-references.mjs` for the Postgres outputs. `bun run provenance:check` validates the manifest only. Other generated files: judgment. |
| `src/schema/substance.schema.ts` owns article shape. `src/data/schema/` is generated from it by `bun run generate:schema`. | `server/lib/articleLifecycleValidation.ts` validates article writes against `src/schema/substance/`. Generated helper drift: judgment. |
| A failed read surfaces as an error. It never becomes empty published content. | Judgment |
| Published content is educational, never medical advice. Legality text follows the reader register in [legality](docs/workflows/legality.md). | `bun run legality:validate` for legality drafts. Everything else: judgment. |
| Never claim production state without deployment evidence. A local change is not a deployed change. | Judgment |
| Add a test only for write guards, auth and roles, revision conflicts, secrets, or data that feeds published dosage, interaction, or legality information. | Judgment |
| No em dashes (U+2014) in `docs/`, `content/`, `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `data/README.md`, or string literals and JSX text under `src/`, `lib/`, and `server/`. Comments there may not add new ones. | `scripts/lint/check-em-dashes.mjs`, run by `bun run lint:all` in CI |

Act on reversible work without asking. Ask before deleting data, force-pushing, or changing anything outside this repository.

## Where to look

- [ARCHITECTURE.md](ARCHITECTURE.md) maps the repository and its generated code.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, local tools, and verification.
- `package.json` is the command catalog.
- [docs/README.md](docs/README.md) indexes every runbook and workflow.
- [docs/glossary.md](docs/glossary.md) defines the domain vocabulary.
- [docs/operations/data-credentials.md](docs/operations/data-credentials.md) is the production write ceremony.
- [docs/operations/deployment.md](docs/operations/deployment.md) covers hosts, builds, and releases.
- [docs/design/ui-kit.md](docs/design/ui-kit.md) covers shared UI.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
