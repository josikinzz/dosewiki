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

`NEXT_PUBLIC_SITE_FLAVOR=effectindex` builds the Effect Index publication;
unset builds dose.wiki. See [deployment](docs/operations/deployment.md) before
changing build keys, hosts, or flavors.

## Verify

Run the narrowest command that covers your change, then the matching
aggregate before opening a pull request:

| Command | Covers |
| --- | --- |
| `npm run test` | Vitest for `src/**` and `lib/**` |
| `npm run test -- <path>` | One test file |
| `npm run typecheck` | Application type check |
| `npm run lint` | ESLint for `src/` and `lib/` |
| `npm run verify:fast` | `test` plus `typecheck` |
| `npm run verify:app` | OpenChemLib fork check, tests, lint, and build |
| `npm run test:workflow` | Script and tool tests under `scripts/**` |
| `npm run verify:workflow` | Workflow tests, script lint, script and handler type checks, cleanup metrics, and data provenance |
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
- Tests defend observable behavior. Add one when a plausible bug would fail
  it; do not add tests that pin wording or implementation details.
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
