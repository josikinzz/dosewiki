# Contributing to dose.wiki

Thank you for helping build a harm-reduction knowledge base. This page covers
the mechanics of a contribution. The rules every change follows are the table
in [AGENTS.md](AGENTS.md). Editorial questions, such as what an article may
claim, how it is cited, and how legality is researched, live under
[docs/workflows/](docs/README.md#workflows).

## Install

The repository pins Bun 1.3.5 (`packageManager` in `package.json`), and CI
runs every package script through `bun run`.

```bash
bun install --frozen-lockfile
cp .env.example .env.local   # then fill in what your task needs
```

`.env.local` is gitignored. `lib/runtime/envContract.ts` reports what the
runtime expects, and [data credentials](docs/operations/data-credentials.md)
explains the production targets and write gates. Most UI and documentation work
needs no database credential.

## Run

```bash
bun run dev      # Next.js development server
bun run build    # production build plus the editor artifact audit
bun run start    # serve the production build
```

### Screenshot the dev tools without signing in

For UI review, a local dev server can render `/dev` documents without an
account. It is read-only and local by construction: it works only under
`next dev`, only with `DEV_SCREENSHOT_VIEWER=1` and `DATA_WRITES_FROZEN=1`, only
for GET requests to `/dev` from a loopback host, and every API keeps its own
session and role check (see `lib/auth/devScreenshotViewer.ts`).

```bash
bun run dev:screenshot-viewer                        # serves http://127.0.0.1:3100 (or dev:journeys-server, below)
bun run dev:screenshot -- /dev/replications          # writes tmp/dev-screenshots/replications-<time>.png
bun run dev:screenshot -- /dev/replications --out tmp/dev-screenshots/replications.png --full-page
```

The server binds to 127.0.0.1 on port 3100 with its own build directory
(`.next-screenshot`), so it runs beside an ordinary `bun run dev`. Any browser on
the same machine can open `http://127.0.0.1:3100/dev/replications`; the tab rail
renders, but private reads answer 401. Run `bun run dev` once first if the
generated theme and icon assets are missing.

The screenshot script uses `playwright-core` and answers the API inside its
own browser from the deterministic fixtures in
`scripts/tools/journeys/fixtures.mjs`: synthetic Writing rows, proposals and
Replication Studio works, a chosen role, and a chosen tool state. Nothing it
answers reaches the server, other origins are aborted, and any write the
fixture does not own is refused in the browser. It waits for the shell to
settle (nothing busy or loading, fonts ready) rather than for network idle and
a fixed sleep.

```bash
bun run dev:screenshot -- /dev/writing/launch-post --role editor --state frozen --theme light
bun run dev:screenshot -- /dev/queue --state empty --width 390 --height 844 --touch
bun run dev:screenshot -- /dev/replications --no-fixtures   # the signed-out view, with its 401s
```

Roles are `admin`, `editor_translator`, `editor`, `translator` and
`contributor`. States are `loaded`, `empty`, `failed` (reads answer 500),
`conflicted` (someone else saves just before your first save, so it answers
409), `frozen` (writes answer 503 with the write-freeze code) and
`session-expired` (tool reads and writes answer 401). Shell-wide reads such as
rail counts stay loaded in every state. Tools the fixture does not cover yet,
such as Substances, still show their loading or error state; add a route to
`fixtures.mjs` and a case to its test to cover one.

### Browser journeys

`bun run test:journeys` drives complete editor journeys in a real browser
against the same fixtures:

```bash
bun run dev:journeys-server                          # terminal 1, 127.0.0.1:3100
bun run test:journeys                                # terminal 2, every journey and variant
bun run test:journeys -- --only conflict-and-reconcile --variant narrow-dark-touch --headed
```

`dev:journeys-server` is the screenshot viewer with its database target
pinned to an unreachable loopback placeholder, so it cannot reach PlanetScale
even when `.env.local` holds real URLs, and the write freeze stays on.
`dev:screenshot-viewer` also works as the server, but it reads whatever
database `.env.local` names for server-rendered data.

| Journey | What it proves |
| --- | --- |
| `edit-and-leave` | Leave stops for unsaved Writing work, Escape keeps editing with focus back on Leave, and Save as unpublished posts once before leaving |
| `reload-and-recover` | A reload asks first, the recovery copy is offered without replacing anything, and Restore brings it back without saving |
| `submit-and-reopen` | An editor's Submit for review posts a proposal, the Queue selects it, and a reviewer opening its link lands on the same record |
| `conflict-and-reconcile` | A stale save is refused with 409 and the draft kept, Load the latest merges, a field both changed needs a choice, and the save goes against the newer revision |
| `state-matrix` | Writing and the Queue render meaningful content in each tool state, and refused writes keep the draft |
| `role-matrix` | Each role gets the Writing controls its role allows |

Each journey runs on a 1440px desktop in the light theme with a mouse and on a
390px viewport in the dark theme with real touch emulation (`hasTouch`,
`isMobile`, coarse pointer); both use the keyboard where an editor would, and
the touch variant fails on a tapped control under 24px. Steps wait on
specific locators, and assertions cover the selected record, the retained
draft, focus, and each request's result. A failure writes a screenshot to
`tmp/journeys/`. The fixtures' own unit tests run with `bun run test:workflow`.

`NEXT_PUBLIC_SITE_FLAVOR=effectindex` builds the Effect Index publication;
unset builds dose.wiki. See [deployment](docs/operations/deployment.md) before
changing build keys, hosts, or flavors.

## Verify

Every pull request runs the CI verification job in
`.github/workflows/vercel-policy-checks.yml`. Its two graph steps call
`bun run verify:checkout` and `bun run verify:drift`, and its first step scans
tracked files for secrets before install. `bun run verify` runs all three.
All three set the job's `DATA_BACKEND=postgres` and `DATA_WRITES_FROZEN=1`
themselves, overriding whatever your shell holds. The job has no inline
checks, so `bun run verify` reproduces it. Pull request CI does not build.
Locally, run the tests that cover your change and the type check, or the whole
graph.

| Command | Covers |
| --- | --- |
| `bun run test -- <path>` | One Vitest file under `src/`, `lib/`, or `server/`. Files run in Node. A test that renders or reads `document`, `window`, or `localStorage` starts with `// @vitest-environment jsdom`, and without it fails with `document is not defined` |
| `bun run test:workflow` | Every script and tool test under `scripts/` |
| `bun run test:workflow -- <path>...` | Only the named `scripts/` test files, each through its own runner (`node:test` or Vitest); an unknown path fails before anything runs |
| `bun run test:evidence -- --runs <n>` | Reruns every suite `n` times and writes `.test-evidence/report.{json,md}`; exits 1 if any file failed or had every test skipped in any run, or if a file in `scripts/test/test-policy.json` did not run |
| `bun run typecheck` | Generates `next-env.d.ts` and the route types with `next typegen`, then runs the application type check with strict null checks on |
| `bun run lint` | ESLint over the repository, then `scripts/lint/check-css-comments.mjs` and `scripts/lint/check-em-dashes.mjs` |
| `bun run lint:files -- <path>...` | The `lint` checks on only the named files: ESLint on JavaScript and TypeScript, and each scanner on the files inside its CI scope |
| `bun run schema:check` | Fails when the `src/data/schema/` helpers drift from `bun run generate:schema`, or when a field override or section list names an unknown or malformed path; writes nothing |
| `bun run check:function-references` | Fails when a call site names an owned Postgres function this checkout does not define |
| `bun run check:build-wiring` | Fails when `vercel.json`, `build:vercel`, or `.vercelignore` break the Vercel build chain |
| `bun run check:test-policy` | Fails when a first-party test file has no category in `scripts/test/test-policy.json`, or when the manifest names a file that no longer exists. Privacy tests count as secrets, publication-visibility tests as auth and roles, and a test that fits no category is a named exception with a reason |
| `bun run check:repository-policy` | Fails when a `vercel.json` function exceeds the Pro plan memory or duration limit, a tracked file other than `.env.example` is named `.env*`, or a non-test file under `src/app/api/` calls `eval`, `new Function`, or `exec`/`spawn` with an interpolated template |
| `bun run verify:checkout` | CI's checkout-safe graph: `openchemlib:verify`, the full `test` and `test:workflow` suites, `typecheck`, `lint`, `typecheck:scripts`, `typecheck:handlers`, `provenance:check`, `schema:check`, and the four `check:` entries |
| `bun run verify:drift` | CI's migration and Drizzle schema drift checks |
| `bun run security:check` | CI's secret scan over every tracked file |
| `bun run verify` | `security:check`, `verify:checkout`, then `verify:drift` |

`package.json` lists every other command. The pre-commit hook in `.husky/`
runs `scripts/security/scan-secrets.mjs --staged` on the exact staged blobs,
then `scripts/security/check-staged-files.mjs`. That script blocks any staged
file named `.env*` other than `.env.example`, renames included, and runs
the `lint:files` checks on the staged paths. Those checks read the working tree,
not the staged blobs.
