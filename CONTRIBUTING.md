# Contributing to dose.wiki

Thank you for helping build a harm-reduction knowledge base. This page covers
the mechanics of a contribution. Editorial questions (what an article may
claim, how it is cited, how legality is researched) live under
[docs/workflows/](docs/README.md#workflows).

## Install

The repository pins Bun 1.3.5 (`packageManager` in `package.json`). Package
scripts also run through `npm run`.

```bash
bun install --frozen-lockfile
cp .env.example .env.local   # then fill in what your task needs
```

Keep secrets in `.env.local`, the shell, or the hosting provider; never commit
credential values. `lib/runtime/envContract.ts` reports what the runtime
expects, and [data credentials](docs/operations/data-credentials.md) explains
the production targets and write gates. Most UI and documentation work needs no
database credential at all.

## Run

```bash
npm run dev      # Next.js development server
npm run build    # production build plus the editor artifact audit
npm run start    # serve the production build
```

### Screenshot the dev tools without signing in

For UI review, a local dev server can render `/dev` documents without an
account. It is read-only and local by construction: it works only under
`next dev`, only with `DEV_SCREENSHOT_VIEWER=1` and `DATA_WRITES_FROZEN=1`, only
for GET requests to `/dev` from a loopback host, and every API keeps its own
session and role check (see `lib/auth/devScreenshotViewer.ts`).

```bash
npm run dev:screenshot-viewer                        # serves http://127.0.0.1:3100 (or dev:journeys-server, below)
npm run dev:screenshot -- /dev/replications          # writes tmp/dev-screenshots/replications-<time>.png
npm run dev:screenshot -- /dev/replications --out tmp/dev-screenshots/replications.png --full-page
```

The server binds to 127.0.0.1 on port 3100 with its own build directory
(`.next-screenshot`), so it runs beside an ordinary `npm run dev`. Any browser on
the same machine can open `http://127.0.0.1:3100/dev/replications`; the tab rail
renders, but private reads answer 401. Run `npm run dev` once first if the
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
npm run dev:screenshot -- /dev/writing/launch-post --role editor --state frozen --theme light
npm run dev:screenshot -- /dev/queue --state empty --width 390 --height 844 --touch
npm run dev:screenshot -- /dev/replications --no-fixtures   # the signed-out view, with its 401s
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

`npm run test:journeys` drives complete editor journeys in a real browser
against the same fixtures:

```bash
npm run dev:journeys-server                          # terminal 1, 127.0.0.1:3100
npm run test:journeys                                # terminal 2, every journey and variant
npm run test:journeys -- --only conflict-and-reconcile --variant narrow-dark-touch --headed
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
`tmp/journeys/`. The fixtures' own unit tests run with `npm run test:workflow`.

`NEXT_PUBLIC_SITE_FLAVOR=effectindex` builds the Effect Index publication;
unset builds dose.wiki. See [deployment](docs/operations/deployment.md) before
changing build keys, hosts, or flavors.

## Verify

Run the tests that cover the files you changed and the type check. CI runs
the full suite on every pull request, so there is no need to run every
aggregate locally for a small change.

| Command | Covers |
| --- | --- |
| `npm run test` | Vitest for `src/**` and `lib/**` |
| `npm run test -- <path>` | One test file |
| `npm run typecheck` | Application type check, with strict null checks on |
| `npm run lint` | ESLint for `src/` and `lib/`, then the em dash check (`scripts/lint/check-em-dashes.mjs`) |
| `npm run verify:fast` | `test` plus `typecheck` |
| `npm run verify:app` | OpenChemLib fork check, tests, lint, and build |
| `npm run test:workflow` | Script and tool tests under `scripts/**` |
| `npm run test:journeys` | Browser journeys through `/dev` against deterministic fixtures; needs `npm run dev:journeys-server` running |
| `npm run verify:workflow` | Workflow tests, script lint, script and handler type checks, and data provenance |
| `npm run verify:all` | Both aggregates; use when app and workflow surfaces both changed |
| `npm run theme:tokens:check`, `npm run theme:classes:check` | Theme token and utility class audits for UI changes |
| `npm run security:check` | The pre-commit secret scan, runnable by hand |

The pre-commit hook in `.husky/` runs the secret scanner against the staged
index. A finding blocks the commit; remove the value and, if it was real,
rotate it.

## Pull requests

- One concern per pull request. Describe what changed and how you verified it;
  paste the verification commands you ran.
- Reuse existing patterns. For UI, browse `/dev/kit` and read the
  [UI kit](docs/design/ui-kit.md) before adding a component. For data shape,
  `src/schema/substance.schema.ts` is canonical.
- Update documentation in the same pull request when ownership, commands, or
  contracts change: `README.md`, `ARCHITECTURE.md`, `docs/README.md`, and the
  owning document under `docs/`.
- Testing is minimal by design. Add a test only for write guards, auth and
  roles, revision conflicts, secrets, or data that feeds published dosage,
  interaction, or legality information. See the
  [test policy](docs/architecture/operations-and-direction.md#test-policy).
- Production data is never written from a pull request. Guarded commands
  require the full ceremony in [data credentials](docs/operations/data-credentials.md),
  and a dry run is not authorization.
- Keep credentials, private hostnames, personal paths, and internal campaign
  chatter out of committed files.

## Writing style

- Plain, direct prose. No em dashes; use a comma, a colon, or a new sentence.
- Name files and commands exactly as they appear in the tree and
  `package.json`.
- Encyclopedic register for anything a reader can see; harm-reduction content
  is educational and never medical advice.

## Where things are

[docs/README.md](docs/README.md) indexes every contributor document.
[ARCHITECTURE.md](ARCHITECTURE.md) is the current-state map, and
[docs/glossary.md](docs/glossary.md) defines the project's vocabulary.
