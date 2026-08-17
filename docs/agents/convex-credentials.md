# Convex credentials

Read this before running any script that writes to Convex. It exists because the
same failure keeps recurring: a write is rejected, the rejection looks like a
missing key, a new key gets minted and added to `.env.local`, and the pile of
keys grows without the write ever succeeding.

## Run the doctor first

```bash
npm run convex:doctor                 # inspect the resolved write target
npm run convex:doctor -- --url=https://glad-minnow-656.convex.cloud
```

It is read-only, prints no secret values (only SHA-1 prefixes), and answers the
three questions that actually matter: which deployment am I pointed at, which
credential will be sent, and will that deployment accept it.

## Function drift: does the deployment even have the function?

A credential problem is not the only invisible failure. **The app build used to
never deploy Convex functions.** `vercel.json` now runs `bun install` /
`bun run build:vercel`; its wrapper (`scripts/deploy/vercel-build.mjs`) publishes
functions only when the `dosewiki-admin` Production build receives the production
`CONVEX_DEPLOY_KEY`. Without that key, it verifies the checkout and builds but
cannot compare or update the live function inventory. See
[deployment.md](deployment.md) for the build branches.

**Historical incident (2026-07-30):** `substanceIndex:setArticleField` existed in
the checkout but not on `glad-minnow-656`. The review portal's inline
click-to-edit failed in production for a day even though local checks, the app
build, and the Vercel deployment all passed.

**Runtime probing cannot diagnose it.** Production redacts all error detail — a
missing function and a bad argument both come back as a bare `Server Error`:

```
{"status":"error","errorMessage":"[Request ID: …] Server Error"}
```

Static comparison of two inventories is the only thing that works.

```bash
npm run convex:check-functions -- --prod            # compare with glad-minnow-656
npm run convex:check-functions -- --checkout-only   # no credential needed
npm run convex:check-functions -- --prod --json
```

Use `--prod` for every live comparison. `npm run convex:doctor` prints the same
comparison as its final section without a non-zero exit. Both commands are
read-only: they run `convex function-spec`, never `convex deploy` or a mutation,
and print function names only.

### What it reports

| Direction | Meaning | Exit |
| --- | --- | --- |
| BROKEN | the app calls it, the deployment does not have it | fails |
| DANGLING | the app calls it, this checkout does not define it | fails |
| UNDEPLOYED | in the checkout, absent from the deployment, nothing calls it | warns |
| AT RISK OF SILENT DELETION | live on the deployment, absent from the working tree | warns |
| VISIBILITY CHANGED | public/internal differs between the two | warns |

The last one matters because `convex deploy` publishes the **working tree**, not
git HEAD, so anything live but absent from the tree is deleted by the next
deploy — see [deployment.md](deployment.md). Pass `--strict` to fail on warnings
too, which is the right setting immediately before a production deploy.

### When to run it

- Before `npm run convex:deploy -- --prod`, run the live comparison with
  `--strict`.
- After any deploy, to confirm the deployment now matches.
- When a UI action fails in production with a bare `Server Error` and works
  locally. That symptom is this bug until proven otherwise.

### Which key reads the deployment

A deploy key is bound to one deployment, and the Convex CLI resolves its target
from the key **ahead of** `--prod` and `CONVEX_DEPLOYMENT`. The production drift
check uses `CONVEX_DEPLOY_KEY_PROD`.

Trust only the `url` field in the `function-spec` response. It must identify
`glad-minnow-656`. If it identifies any other deployment, stop and fix the
credential or environment before continuing. In particular,
`enchanted-echidna-791` is retired; seeing it is a wrong-target result, not a
valid dev check.

### CI coverage

`.github/workflows/vercel-policy-checks.yml` has two branches:

- **Call-site integrity** (`--checkout-only`) always runs without a credential.
  It catches a call site naming a function this checkout does not define. This
  is the static coverage for untyped string names in
  `lib/convex/publicData.reads.ts`; typecheck cannot see them.
- **Function drift against production** runs only when the repository has
  `CONVEX_DEPLOY_KEY_PROD`. Without that secret, the step uses
  `--skip-without-credentials`, prints `SKIPPED`, and exits 0. Treat that result
  as an unenforced check, not a pass.

When the secret is absent, run
`npm run convex:check-functions -- --prod` locally before shipping any caller of
a new Convex function.

## The rule that causes the confusion

**An admin token is only valid on the deployment where it was configured.** The
token is checked inside the Convex function against that deployment's own
environment (`convex/lib/adminIntentTokens.ts`), not against anything local. A
local token that has drifted or belongs to another deployment authenticates
locally and is then rejected by the mutation. The authorization error can look
like a missing key, but minting another local value does not repair the mismatch.

The authoritative value is the deployment's own:

```bash
bunx convex env get CONVEX_ADMIN_KEY --prod
```

Minting a new key does not help unless you also set it on the deployment.

## Sole Convex target

All local, development, Vercel Preview, and Production reads and writes target:

| Role | Deployment |
| --- | --- |
| Live data and functions | `glad-minnow-656` |

Do not mirror production into a second deployment or route a local or preview
environment elsewhere. `enchanted-echidna-791` is retired.

The runtime resolution rules live in `lib/convex/runtimeTargets.ts`; script
resolution and write guards live in
`scripts/lib/data-ops-run-context.mjs` and
`scripts/lib/production-write-command.mjs`. Configure every resolved URL to
`https://glad-minnow-656.convex.cloud`. Privileged scripts must receive that URL
explicitly through `TARGET_CONVEX_URL` or `--target-url`; do not rely on a browser
or compatibility fallback to select a write target.

## Wrong-target and split detection

Stale environment variables can still make the editor browser read one
deployment while its server writes another. That creates two failures:

- optimistic-concurrency writes report a false "changed since you loaded it"
  conflict because the comparison runs against different stored data;
- full editor saves can report success after writing the wrong deployment.

`/dev` and `/review` therefore refuse to render when the browser-read and
privileged-write deployments differ. The comparison runs in the server component
so the privileged URL never reaches the browser; only deployment names appear in
the error. `npm run convex:doctor` reports the same result under **Editor surface
read/write alignment**, and `/api/editor-config-health` includes it in
`diagnostics.warnings`.

| Resolved configuration | Verdict |
| --- | --- |
| Every configured Convex URL resolves to `glad-minnow-656` | aligned |
| Browser-read and privileged-write URLs resolve to different deployments | split — editor and review refuse to render |
| Any active URL resolves to a deployment other than `glad-minnow-656` | wrong target — stop |
| No privileged write target or admin credential is configured | read-only |

Fix a split or wrong target by pointing every active Convex URL at
`glad-minnow-656`; bypassing the refusal does not make the configuration safe.

## Intent-scoped tokens

Each data operation asks for its own scoped token. When that token is absent,
most operations use `CONVEX_ADMIN_KEY` as a compatibility fallback. The doctor
shows the credential actually selected for each intent and whether production
accepts it.
`generatedPublicationWrite` is the exception: its publication boundary requires
the scoped token and rejects the legacy admin key.

| Intent | Environment variable |
| --- | --- |
| `editorArticleWrite` | `CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE` |
| `promptMigrationWrite` | `CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE` |
| `quoteMigrationWrite` | `CONVEX_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE` |
| `profileMediaWrite` | `CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE` |
| `replicationMaintenance` | `CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE` |
| `articleSourceMigration` | `CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION` |
| `productionSync` | `CONVEX_ADMIN_TOKEN_PRODUCTION_SYNC` |
| `citationEvidenceWrite` | `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE` |
| `citationEvidenceReview` | `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW` |
| `generatedPublicationWrite` | `CONVEX_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE` |
| `reagentTestImport` | `CONVEX_ADMIN_TOKEN_REAGENT_TEST_IMPORT` |

The registry is duplicated on both sides — `scripts/lib/data-ops-run-context.mjs`
(client) and `convex/lib/adminIntentTokens.ts` (server). Adding an intent means
editing both.

## Fixing a rejected write

1. Run the doctor against production:
   `npm run convex:doctor -- --url=https://glad-minnow-656.convex.cloud`.
   Confirm the reported target is `glad-minnow-656`.
2. If the verdict is REJECTED, take the value accepted by that deployment:
   `bunx convex env get CONVEX_ADMIN_KEY --prod`.
3. Copy that value into the matching local variable. For an intent-scoped token,
   configure the same value on the deployment and in the caller:
   `bunx convex env set CONVEX_ADMIN_TOKEN_<INTENT> <value> --prod`.
4. Re-run the doctor and confirm both the production target and an OK credential
   verdict before running the write.

Do not add another local key until the doctor has confirmed the target. An
unverified new value is indistinguishable from the one that just failed.

## Write guardrails

Production writes additionally require, per `scripts/lib/production-write-command.mjs`:

- `--write`
- `--confirm-write=<operation-name>`
- `--expected-deployment=<fingerprint>` matching the resolved target
- the operation's own confirm flag where one exists (e.g. `--confirm-audio-import`)

Every script's default is a dry run. Dry runs need no credential and are the
correct way to inspect a plan.
