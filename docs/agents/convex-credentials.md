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

A credential problem is not the only invisible failure. **The app build never
deploys Convex functions.** `vercel.json` runs `bun install` / `bun run build`,
and `build` is plain `next build`; functions move only on an explicit
`convex deploy`. A merged, built, deployed release can therefore call a mutation
that exists in the checkout and on dev but was never published to production.

This is not theoretical. `substanceIndex:setArticleField` was added on
2026-07-30 and never deployed to `glad-minnow-656`; the review portal's inline
click-to-edit was broken in production for a day. Every local check passed, the
build passed, the deploy passed.

**Runtime probing cannot diagnose it.** Production redacts all error detail — a
missing function and a bad argument both come back as a bare `Server Error`:

```
{"status":"error","errorMessage":"[Request ID: …] Server Error"}
```

Static comparison of two inventories is the only thing that works.

```bash
npm run convex:check-functions -- --prod      # compare against glad-minnow-656
npm run convex:check-functions                # compare against dev (default)
npm run convex:check-functions -- --checkout-only   # no credential needed
npm run convex:check-functions -- --prod --json
```

`npm run convex:doctor` prints the same comparison as its final section, without
a non-zero exit. Both are read-only: they run `convex function-spec`, never
`convex deploy` and never a mutation, and print function names only.

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

- Before `convex deploy --prod`, with `--strict`.
- After any deploy, to confirm the deployment now matches.
- When a UI action fails in production with a bare `Server Error` and works
  locally. That symptom is this bug until proven otherwise.

### Which key reads which deployment

A deploy key is bound to one deployment, and the Convex CLI resolves its target
from the key **ahead of** `--prod` and `CONVEX_DEPLOYMENT`. Asking for the wrong
one does not error; it quietly reports the other deployment.

| Deployment | Deploy key variable |
| --- | --- |
| `enchanted-echidna-791` (dev) | `CONVEX_DEPLOY_KEY` |
| `glad-minnow-656` (production) | `CONVEX_DEPLOY_KEY_PROD` |

The check trusts only the `url` field in the `function-spec` payload for naming
which deployment answered, and warns when that disagrees with what you asked for.

### CI coverage, stated plainly

`.github/workflows/vercel-policy-checks.yml` runs two steps:

- **Call-site integrity** (`--checkout-only`) — always runs, no credential.
  Catches a call site naming a function this checkout does not define. This is
  the only static coverage the untyped string names in
  `lib/convex/publicData.reads.ts` have; typecheck cannot see them.
- **Function drift against production** — **currently inert.** Reading a live
  function list needs a deploy key, and this repository has **no GitHub Actions
  secrets configured at all**. The step passes `--skip-without-credentials`, so
  it prints a skip notice and exits 0. Adding `CONVEX_DEPLOY_KEY_PROD` as a
  repository secret is the only change needed to make the gate real.

Until that secret exists, CI **cannot** catch the `setArticleField` class of
outage. Run `npm run convex:check-functions -- --prod` locally before shipping
anything that calls a new Convex function.

## The rule that causes the confusion

**An admin token is only valid on the deployment it was minted on.** The token
is checked inside the Convex function against that deployment's own environment
(`convex/lib/adminIntentTokens.ts`), not against anything local. A copy in
`.env.local` that has drifted, or that was minted on dev and used against prod,
authenticates locally and is then rejected by the mutation. The error surfaces
as an authorization failure, which reads like "the key is missing" — it is not.

The authoritative value is the deployment's own:

```bash
bunx convex env get CONVEX_ADMIN_KEY      # what THIS deployment will accept
```

Minting a new key does not help unless you also set it on the deployment.

## Two deployments

| Purpose | Deployment | Pointed at by |
| --- | --- | --- |
| Dev / staging | `enchanted-echidna-791` | `VITE_CONVEX_URL`, `CONVEX_DEPLOYMENT` |
| Public read (production) | `glad-minnow-656` | `CONVEX_PUBLIC_READ_URL` |

They hold different data and different credentials. `npm run convex:doctor`
prints which one each variable currently resolves to.

## URL resolution order

Scripts do not read a single variable. First non-empty wins:

- **Write target** — `TARGET_CONVEX_URL`, `CONVEX_URL`, `VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`
- **Read source** — `SOURCE_CONVEX_URL`, `CONVEX_PUBLIC_READ_URL`, `CONVEX_URL`, `VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`

Consequence worth internalising: with only `VITE_CONVEX_URL` set, a write script
targets **dev**, whatever you intended. Set `TARGET_CONVEX_URL` explicitly for
production writes rather than relying on the tail of that list.

## The read/write split, and why the editor refuses to run on one

The running Next app resolves its Convex targets from **different, overlapping**
chains (`lib/convex/runtimeTargets.ts`), and neither matches the script chains
above:

- **Editor browser read** — `NEXT_PUBLIC_CONVEX_URL`, `VITE_CONVEX_URL`
- **Privileged server write** — `CONVEX_URL`, `VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`

Because the two lists overlap but are ordered differently, a host can read one
deployment while writing another. The local `.env.local` shape plus a single
extra variable does exactly that: `VITE_CONVEX_URL=`dev with
`NEXT_PUBLIC_CONVEX_URL=`prod reads **production** and writes **dev**.

Under that split the two deployments' differing data produces two distinct
failures, neither of which names the cause:

- Every optimistic-concurrency write fails as a bogus "changed since you loaded
  it" conflict — the `expected` value was read from one deployment and the
  compare-and-swap runs against the other's stored value
  (`convex/lib/articleFieldWrites.ts`).
- The full editor save has **no** such check and silently writes the wrong
  deployment. It reports success. That is the dangerous half.

So `/dev` and `/review` **refuse to render** on a split. The comparison happens
in the server component, above the client shell, because the privileged write
URL must never be shipped to the browser; only deployment *names* cross into the
rendered page. The refusal names both deployments and the variable each was
resolved from.

`npm run convex:doctor` prints the same comparison as its
**Editor surface read/write alignment** section, and `/api/editor-config-health`
carries it in `diagnostics.warnings`.

### What does and does not trip it

| Configuration | Verdict |
| --- | --- |
| `CONVEX_URL` and `NEXT_PUBLIC_CONVEX_URL` on the same deployment | aligned |
| `VITE_CONVEX_URL` alone, feeding both chains | aligned |
| `NEXT_PUBLIC_CONVEX_URL`=prod + `VITE_CONVEX_URL`=dev, no `CONVEX_URL` | **split — refuses** |
| `CONVEX_URL`=dev + `NEXT_PUBLIC_CONVEX_URL`=prod | **split — refuses** |
| Effect Index: `CONVEX_PUBLIC_READ_URL` + `NEXT_PUBLIC_CONVEX_URL`, both prod, no `CONVEX_URL`, no admin key | aligned (write chain falls back to the same deployment) |
| Nothing in the write chain at all | `no-write-target` — read-only posture, **not** a split |

The read-only publication deployment is deliberately exempt: "no write target"
is a valid, intended configuration and never trips the refusal.

### Overriding it

Setting `CONVEX_ALLOW_TARGET_SPLIT=1` downgrades the refusal to a permanent,
non-dismissable banner over the surface so a misconfigured local checkout is
never bricked. Reads and writes still disagree — this acknowledges the split, it
does not fix it. Fix it by pointing `CONVEX_URL` and `NEXT_PUBLIC_CONVEX_URL` at
the same deployment.

## Intent-scoped tokens

Each data operation asks for its own token. Absent that, it silently falls back
to `CONVEX_ADMIN_KEY` — which is why a missing scoped token does not announce
itself until the mutation rejects it.

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

1. `npm run convex:doctor` — confirm the target deployment and the verdict.
2. If the verdict is REJECTED, take the deployment's own value:
   `bunx convex env get CONVEX_ADMIN_KEY`
3. Either copy that into `.env.local`, or set the scoped token on the
   deployment so the local one becomes valid:
   `bunx convex env set CONVEX_ADMIN_TOKEN_<INTENT> <value>`
4. Re-run the doctor and confirm OK before running the write.

Do not add another key to `.env.local` without step 1. An unverified new key is
indistinguishable from the one that just failed.

## Write guardrails

Production writes additionally require, per `scripts/lib/production-write-command.mjs`:

- `--write`
- `--confirm-write=<operation-name>`
- `--expected-deployment=<fingerprint>` matching the resolved target
- the operation's own confirm flag where one exists (e.g. `--confirm-audio-import`)

Every script's default is a dry run. Dry runs need no credential and are the
correct way to inspect a plan.
