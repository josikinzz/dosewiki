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
