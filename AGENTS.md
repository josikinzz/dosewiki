# AGENTS.md

dose.wiki is an open encyclopedia of psychoactive substances for harm reduction, research, and education. This public repository is the Next.js application behind dose.wiki and its Effect Index publication. Errors in published dosage, interaction, or legality data can hurt readers, which is why most rules below guard writes and published content.

## Rules

"Judgment" marks a rule that no check enforces. Nothing fails when you skip it, so read those rows before you act.

| Rule | Enforced by |
| --- | --- |
| PlanetScale Postgres is the only runtime and the source of truth. Files under `data/` and `content/` are seeds and exports, never the live record. | `requirePostgresBackend` in `lib/postgres/runtime/target.ts` throws unless `DATA_BACKEND=postgres`. No other backend exists. |
| A production write needs `DATA_BACKEND=postgres`, an explicit `--target` or `TARGET_POSTGRES_URL`, and every confirmation the command names. Follow [data credentials](docs/operations/data-credentials.md). | `authorizeProductionWrite` in `scripts/lib/production-write-command.mjs`, the allowlist in `scripts/lib/production-writer-inventory.mjs`, and `scripts/postgres/targetGuard.ts` |
| A dry run or a passing guard is not authorization. A human approves each production write. | Judgment |
| Every write path fails closed while `DATA_WRITES_FROZEN=1`. Never weaken the freeze, target checks, confirmation phrases, or role checks. | `assertDataWritesNotFrozen` in `lib/runtime/dataWriteFreeze.ts` throws while the freeze is on. `authorizeProductionWrite`, `assertDataOpsWriteAllowed` in `scripts/lib/data-ops-run-context.mjs`, and the mutation path in `lib/postgres/runtime/client.ts` call it. Whether every write path calls it, and weakening a guard: judgment. |
| Public, editor, and Effect Index builds are separate artifacts. Only the editor build carries editorial browser modules. | `scripts/build/editor-artifact-audit.mjs` fails a public build that contains editor-only modules or a browser Postgres client. `bun run build` runs it on Vercel builds and in the `release-build` job. Pull request CI does not build. |
| Only the editor deployment receives write credentials. | Judgment. `lib/postgres/runtime/deploymentEnv.ts` does not require `DATA_ADMIN_KEY`, so a read-only deployment starts without it, but nothing rejects a public deployment that has it. |
| Authorization comes from an Auth.js session plus the current `memberships` role. A credential alone authorizes only these scoped exceptions: `/api/dev/revalidate-article` (a `citationEvidenceWrite` admin-intent token), the cron routes and `/api/warm` (`CRON_SECRET` through `cronRoute`), `/api/public-cache/revalidate` (a signed publication body), the public intake routes `/api/article-feedback`, `/api/site-feedback`, `/api/glossary-feedback`, `/api/trip-report-submissions`, and `/api/subscribe` (create-only service mutations through the server's `publicIntakeCreate` token), and workstation scripts holding an admin-intent token. Adding an exception: judgment. | `mutationAsService` in `lib/data/serverWriteCapability.ts` refuses any mutation outside `SERVICE_MUTATION_NAMES`, which holds the intake creates, `mailingList:subscribe`, and the two publication-delivery mutations the cron calls. The lint rule `vercel-guardrails/require-route-access` in `scripts/eslint-plugins/vercel-guardrails/index.js`, run by `bun run lint`, fails any exported handler in `src/app/api/**/route.ts` that does not reach `protectedRouteOperation` with an inline `auth` floor or a recognized guard factory, unless `routeAccessExceptions` in `eslint.config.mjs` names that method. Besides the sign-in, invite, and password-reset paths, `src/middleware.ts` lets only the revalidation POST and the service crons past the editor session gate. `requireRole` in `server/lib/auth.ts` and `roleMeetsFloor` in `src/lib/auth/roles.ts` check the floor. A script token that names no `actorEmail` resolves to `admin` in `server/lib/auth.ts`. |
| Public source code grants no access to editorial systems and does not authorize data writes. | Judgment |
| Sign-in is username and password against `memberships`. Do not add password-only browser auth or OAuth providers. | `lib/auth/authOptions.ts` registers only `CredentialsProvider`. Adding a provider: judgment. |
| Article saves carry the revision the editor loaded, and a stale save fails. | `baseHash` checks in `server/lib/articleWrite.ts` and `server/saveArticleBatch.ts` |
| Only a human editor sets review status. Agent review writes only advisory flags ([ADR 0003](docs/adr/0003-advisory-review-flags.md)). | Agent flag writes cannot change status: `replaceAgentReviewFlagsHandler` in `server/lib/substanceReviewHandlers.ts` keeps the stored status and replaces only agent flags. `setEditorialReviewHandler` there requires the `admin` floor to mark a review `completed` and `editor` for other statuses. That a human, not a script, sets status: judgment, because a script token with no `actorEmail` passes the `admin` floor. |
| Never commit credentials, credential-bearing URLs, or `.env` files other than `.env.example`. | `scripts/security/scan-secrets.mjs` in `.husky/pre-commit` (`--staged`) and CI (`--tracked`). `.husky/pre-commit` and `scripts/security/check-repository-policy.mjs` (`bun run check:repository-policy`, run in CI by `verify:checkout`) reject `.env` files. |
| Add each new environment variable to `.env.example`. | Judgment |
| Never commit personal data, private contact details, visitor addresses, private hostnames, or workstation paths. Use reserved example identities in tests and docs. | Judgment. `scripts/security/scan-secrets.mjs` finds credential shapes only. |
| If a secret or private record enters Git, stop publishing and report only its location and a redacted fingerprint. Removing it from the latest tree is not enough. The owner decides on revocation and history cleanup. | Judgment |
| Workflows for public or Effect Index builds never receive write-tier secrets such as `DATA_ADMIN_KEY` or write-grant database URLs. | Judgment. The `release-build` job in `.github/workflows/vercel-policy-checks.yml` uses only `POSTGRES_POOLED_READONLY_URL`. |
| Never hand-edit a file that `data/lineage.json` marks `do-not-edit-by-hand`. Change the producer input and follow its `refresh` entry. | CI runs `bun run postgres:check-schema` and `bun run postgres:verify-migrations`, which fail when `lib/postgres/schema.generated.ts` drifts from its producer or from the latest migration. `bun run schema:check` fails when the `src/data/schema/` helpers drift from `bun run generate:schema`. `bun run provenance:check` validates the manifest only. Other generated files: judgment. |
| `src/schema/substance.schema.ts` owns article shape. `src/data/schema/` is generated from it by `bun run generate:schema`. | `server/lib/articleLifecycleValidation.ts` validates article writes against `src/schema/substance/`. `bun run schema:check` in CI fails when the generated helpers drift. |
| A failed read surfaces as an error. It never becomes empty published content. | Judgment |
| Published content is educational, never medical advice. Legality text follows the reader register in [legality](docs/workflows/legality.md). | Judgment. `bun run legality:validate` checks a legality draft when you run it. No hook or CI step runs it. |
| Never claim production state without deployment evidence. A local change is not a deployed change. | Judgment |
| Add a test only for write guards, auth and roles, revision conflicts, secrets, or data that feeds published dosage, interaction, or legality information. | Judgment |
| No em dashes (U+2014) in text under `docs/`, `content/`, `src/`, `lib/`, and `server/`, or in `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, and `data/README.md`. The scanner excludes binary file types. | `scripts/lint/check-em-dashes.mjs`, run by `bun run lint` in CI and on staged files by `.husky/pre-commit` |
| No comments in JS, TS, or CSS source except tool-read directives (ESLint, Vitest, bundler magic, pure annotations, shebangs, and license or preservation headers). Generated and vendor exclusions are defined in `scripts/lib/comment-scope.mjs`. | ESLint plugin/rule `code-hygiene/no-comments` in `scripts/eslint-plugins/code-hygiene/index.mjs` and the CSS check `scripts/lint/check-css-comments.mjs`, both run by `bun run lint` in CI and on staged files by `.husky/pre-commit` |

Act on reversible work without asking. Ask before deleting data, force-pushing, or changing anything outside this repository.

## Where to look

- [ARCHITECTURE.md](ARCHITECTURE.md) maps the repository and its generated code.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, local tools, and verification.
- `package.json` is the command catalog.
- `.rgignore` hides bulk generated and archived payloads from `rg`. Search one on purpose with `rg --no-ignore <pattern> <path>`. `data/lineage.json` names the producer of each generated one.
- ripgrep 15.0.0 applies `.rgignore` unreliably when one invocation names several roots: `rg -l dosage data content vendor public` leaked about 60 bulk paths in 18 of 20 runs. Pass no path or one root per invocation, or add explicit `--glob '!<path>/**'` exclusions. Each of those forms leaked nothing in 20 runs.
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
