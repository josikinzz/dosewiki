# Social cards

Social cards are the Open Graph and Twitter images for substance, page, and entity routes. Builds never render or upload them. Each family has a tracked manifest that maps a route to an immutable R2 URL, and the phases below replace it. Run them in order, one family at a time.

This runbook names commands. It authorizes none of them. A human approves each run that reads production Postgres or reads or writes R2, and approves each phase separately. A dry run or a passing guard is not authorization. [Data credentials](data-credentials.md) is the credential ceremony and the authority for the remote read scope.

| Family | Generator | Manifest, publisher input and install target | Rendered images | Source |
| --- | --- | --- | --- | --- |
| Substance | `scripts/build/generateSubstanceSocialCards.ts` | `src/data/substanceSocialCardManifest.generated.json` | `public/images/social/substances/` | Postgres |
| Page | `scripts/build/generatePageSocialCards.ts` | `src/data/pageSocialCardManifest.generated.json` | `public/images/social/pages/` | Working tree and `https://dose.wiki/api/replications/gallery` |
| Entity | `scripts/build/generateEntitySocialCards.ts` | `src/data/entitySocialCardManifest.generated.json` | `public/images/social/entities/` | Postgres and card media over HTTPS |

Each generator writes JPEGs under `public/images/social/` (ignored by Git) and overwrites its manifest with local `/images/social/...` paths. That local-path manifest is the publisher's input. It is not deployable until the install phase writes a candidate over it. With `NEXT_PUBLIC_SITE_FLAVOR=effectindex` every generator exits without rendering.

`bun run generate:social-cards -- <args>` runs all three generators in table order and passes every argument to each. The page generator ignores `--expected-deployment` and `--allow-remote`, and the other two ignore `--only`. The family sections below run one generator at a time.

## Remote Postgres read

The substance and entity generators build their client with `createDataClient` in `scripts/lib/data-client.ts`. It checks these requirements in this order, before any query, and the generator then checks the fingerprint:

| Requirement | Refusal when it is missing |
| --- | --- |
| `DATA_BACKEND=postgres` | `Normal data access requires DATA_BACKEND=postgres; no fallback backend is permitted.` |
| A target in `TARGET_POSTGRES_URL` or `--target=<url>`. Without either, the client falls back to `POSTGRES_POOLED_URL`, then `POSTGRES_DIRECT_URL`. | `createDataClient: DATA_BACKEND=postgres needs --target <url>, TARGET_POSTGRES_URL, POSTGRES_POOLED_URL, or POSTGRES_DIRECT_URL.` |
| `--allow-remote` when the target host is not `localhost`, `127.0.0.1`, or `::1` | `Refusing non-local target db.example.test; pass --allow-remote and POSTGRES_IMPORT_CONFIRM=db.example.test` |
| `POSTGRES_IMPORT_CONFIRM` equal to the bare target hostname, without port or database, for the same non-loopback hosts | `POSTGRES_IMPORT_CONFIRM must equal db.example.test to write to a remote target`. Write commands share this guard, so the message says write, though these generators only read. |
| `REPLICATION_MEDIA_BASE_URL` set to an `https://` media origin | `Postgres runtime configuration is missing: REPLICATION_MEDIA_BASE_URL. ...`, or `... has an invalid REPLICATION_MEDIA_BASE_URL. ...` for a non-HTTPS value |
| `--expected-deployment=<host>/<database>` naming the selected target, in `=` form | `Social cards require --expected-deployment=<fingerprint> for the selected Postgres source.` The entity generator says `Entity social cards require ...`. |

Set the target explicitly. Bun loads `.env.local` from the working directory for every variable you did not set, so a fallback URL there selects the source without notice, and `--expected-deployment` becomes the only check. Prefer `TARGET_POSTGRES_URL` to `--target`, because data credentials keeps credential values out of argv.

The generators issue only queries. Set `DATA_WRITES_FROZEN=1` for the read, and the client refuses any mutation or action.

Load credentials as data credentials describes, without printing them, then set the read target. The host, database, and media origin below are reserved examples:

```bash
export DATA_BACKEND=postgres
export TARGET_POSTGRES_URL=<approved read URL for db.example.test/dosewiki>
export POSTGRES_IMPORT_CONFIRM=db.example.test
export REPLICATION_MEDIA_BASE_URL=https://media.example.test
export DATA_WRITES_FROZEN=1
```

With these values the fingerprint is `db.example.test/dosewiki`. A local rehearsal against `postgres://localhost:5432/dosewiki` needs neither `--allow-remote` nor `POSTGRES_IMPORT_CONFIRM`, and its fingerprint is `localhost/dosewiki`.

## R2 access

R2 phases read `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_S3_ENDPOINT`, and `CLOUDFLARE_R2_BUCKET`, and the publisher loads `.env.local` from the working directory. `--rclone-remote=<remote>:<bucket>/<path>` with `--bucket-label=<label>` uses rclone instead. Install needs the same configuration, because it checks the confirmations against it.

`--confirm-target` is the host of `CLOUDFLARE_R2_S3_ENDPOINT`, or the `--rclone-remote` value. `--confirm-bucket` is `CLOUDFLARE_R2_BUCKET`, or the `--bucket-label` value. The commands below write them as `<endpoint host>` and `<bucket>`.

The publisher's gates are `--write`, the four `--confirm-*` flags, the ledgers, and the human approval. The shared storage authorizer (`authorizeStorageWrite` in `scripts/lib/storage-write-authorization.mjs`) checks the write freeze, `--write`, and all four confirmations before any write or install. This runbook never authorizes clearing a write freeze.

The publisher plans URLs on `--delivery-base`, else `SOCIAL_CARD_CDN_BASE`, which it can read from `.env.local`, else its built-in default. The verifier reads only `--delivery-base`. When a plan used a non-default base, pass the same `--delivery-base` to every verifier run for that plan.

## How each phase behaves

1. **Plan.** Without `--preflight-r2`, `--write`, or `--install-candidate` the publisher makes no network request, R2 write, or manifest change. It hashes every local card, carries entries already on the delivery base as published, prints `Plan <digest>`, and writes the candidate manifest with R2 URLs and `promotion.planDigest`. The input and target manifests default to the entity manifest, and the ledgers default to `runs/social-card-r2-promotion/`, so every command below names them. Adding `--preflight-r2` makes a credentialed read that classifies each object as reusable or absent and writes nothing.
2. **Canary.** Repeat the plan arguments, add one or more `--canary-selector` values, and add `--write` with the four confirmations. Only the selected objects are uploaded or confirmed as already present, and no manifest changes. Any confirmation that does not match the current plan and target refuses the run.
3. **Full apply.** Repeat the canary command without any selector and add `--resume`. It refuses unless the same ledger records a completed canary for this exact plan digest. A selector left in the command runs another canary instead.
4. **Verify objects.** The verifier fetches every unique object in the candidate from the delivery base and checks its digest, length, content type, cache policy, inline disposition, and byte-range support.
5. **Install.** Repeat the plan arguments and the confirmations, and add `--install-candidate` with the target, rollback, and verification-ledger paths. It refuses without a completed full apply for this plan in the publisher ledger, complete object verification for this plan in the verification ledger, and a candidate carrying the same plan digest. It also refuses if the rollback file exists, so give each refresh a fresh run directory. It copies the current target to the rollback file, then writes the candidate over the target.

Objects go to digest-named keys under `media/sha256/`. An existing key with different bytes stops the run with `IMMUTABLE COLLISION`.

Because the generator wrote local paths into the target manifest, the rollback file holds that local-path manifest. The previous R2 manifest is the committed version in Git.

## Canary selectors

The publisher turns each manifest leaf into a card. The card's category is the first key under `cards`, and its slug is the remaining keys joined by `/`. A selector `<category>:<slug>` must match one card exactly. A selector that is a digest key, `media/sha256/<2 hex>/<64 hex>.jpg`, selects that object directly. A `--canary=<file>` JSON array takes the same strings, or `{"category": "...", "slug": "..."}` objects.

The substance and page manifests are flat, so each card's category is its key and its slug is empty. The entity manifest nests slugs under `effects`, `replications`, `reports`, and `contributors`.

| Family | Selects one card | Refused as `Unknown canary selector` |
| --- | --- | --- |
| Substance | `ketamine:` | `substances:ketamine` |
| Page | `home:`, or `substances:` for the Substances index card | `pages:home` |
| Entity | `effects:<slug>`, or that card's digest key | `effects:` |

The digest key for a card is the part of its candidate manifest URL after the delivery base.

Pick a canary card whose entry in the input manifest is a local `/images/social/...` path. An entry that already holds an R2 URL is carried as published and has no object to upload, so its selector selects nothing and the canary still completes. Check that the canary prints `Canary complete: 1 objects` or more before you run the full apply.

## Substance cards

Manifest `src/data/substanceSocialCardManifest.generated.json`. Run directory `runs/social-card-r2-promotion/substance/` (ignored by Git).

Generate, with the remote Postgres read variables set:

```bash
bun scripts/build/generateSubstanceSocialCards.ts --allow-remote \
  --expected-deployment=db.example.test/dosewiki
```

Plan. Record the printed plan digest. Add `--preflight-r2` for the optional R2 read.

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/substanceSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/substance/candidate.json \
  --ledger=runs/social-card-r2-promotion/substance/publisher.jsonl
```

Canary:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/substanceSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/substance/candidate.json \
  --ledger=runs/social-card-r2-promotion/substance/publisher.jsonl \
  --canary-selector=ketamine: \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

Full apply:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/substanceSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/substance/candidate.json \
  --ledger=runs/social-card-r2-promotion/substance/publisher.jsonl \
  --resume \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

Verify objects:

```bash
bun run verify:social-cards -- \
  --manifest=runs/social-card-r2-promotion/substance/candidate.json \
  --ledger=runs/social-card-r2-promotion/substance/verification.jsonl \
  --objects-only
```

Install:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/substanceSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/substance/candidate.json \
  --ledger=runs/social-card-r2-promotion/substance/publisher.jsonl \
  --install-candidate \
  --target-manifest=src/data/substanceSocialCardManifest.generated.json \
  --rollback-manifest=runs/social-card-r2-promotion/substance/rollback.json \
  --verification-ledger=runs/social-card-r2-promotion/substance/verification.jsonl \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

## Page cards

Manifest `src/data/pageSocialCardManifest.generated.json`. Run directory `runs/social-card-r2-promotion/page/`.

Generate. The page generator reads no Postgres. It reads the working tree, and fetches live counts from `https://dose.wiki/api/replications/gallery` when it renders the `replications` card. `--only=<key>` renders one card and keeps the other manifest entries. The keys are `home`, `substances`, `effects`, `replications`, `chemical-classes`, `about`, `china`, and `languages`.

```bash
bun scripts/build/generatePageSocialCards.ts --only=home
```

Plan:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/pageSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/page/candidate.json \
  --ledger=runs/social-card-r2-promotion/page/publisher.jsonl
```

Canary:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/pageSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/page/candidate.json \
  --ledger=runs/social-card-r2-promotion/page/publisher.jsonl \
  --canary-selector=home: \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

Full apply:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/pageSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/page/candidate.json \
  --ledger=runs/social-card-r2-promotion/page/publisher.jsonl \
  --resume \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

Verify objects:

```bash
bun run verify:social-cards -- \
  --manifest=runs/social-card-r2-promotion/page/candidate.json \
  --ledger=runs/social-card-r2-promotion/page/verification.jsonl \
  --objects-only
```

Install:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/pageSocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/page/candidate.json \
  --ledger=runs/social-card-r2-promotion/page/publisher.jsonl \
  --install-candidate \
  --target-manifest=src/data/pageSocialCardManifest.generated.json \
  --rollback-manifest=runs/social-card-r2-promotion/page/rollback.json \
  --verification-ledger=runs/social-card-r2-promotion/page/verification.jsonl \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

## Entity cards

Manifest `src/data/entitySocialCardManifest.generated.json`. Run directory `runs/social-card-r2-promotion/entity/`.

Generate, with the remote Postgres read variables set. The generator also downloads card media over HTTPS. It renders replication cards only with `GENERATE_REPLICATION_SOCIAL_CARDS=1`, and otherwise keeps the existing replication entries whose slugs are still eligible. `ENTITY_SOCIAL_CARD_OUTPUT_ROOT` and `ENTITY_SOCIAL_CARD_MANIFEST_PATH` redirect its output. The output root holds the `entities/` level itself, so with `ENTITY_SOCIAL_CARD_OUTPUT_ROOT=<run>/social/entities` pass `--assets-root=<run>/social`, its parent, because the publisher appends the `entities/...` part of each manifest URL. Pass the redirected manifest path as `--input-manifest` and `--target-manifest` below.

```bash
bun scripts/build/generateEntitySocialCards.ts --allow-remote \
  --expected-deployment=db.example.test/dosewiki
```

Plan:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/entitySocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/entity/candidate.json \
  --ledger=runs/social-card-r2-promotion/entity/publisher.jsonl
```

Canary. Name a newly rendered card as `<kind>:<slug>`, or pass its digest key as `--canary-selector=media/sha256/<2 hex>/<64 hex>.jpg`.

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/entitySocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/entity/candidate.json \
  --ledger=runs/social-card-r2-promotion/entity/publisher.jsonl \
  --canary-selector=effects:<slug> \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

Full apply:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/entitySocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/entity/candidate.json \
  --ledger=runs/social-card-r2-promotion/entity/publisher.jsonl \
  --resume \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

Verify objects:

```bash
bun run verify:social-cards -- \
  --manifest=runs/social-card-r2-promotion/entity/candidate.json \
  --ledger=runs/social-card-r2-promotion/entity/verification.jsonl \
  --objects-only
```

Install:

```bash
bun run publish:social-cards -- \
  --input-manifest=src/data/entitySocialCardManifest.generated.json \
  --assets-root=public/images/social \
  --candidate-manifest=runs/social-card-r2-promotion/entity/candidate.json \
  --ledger=runs/social-card-r2-promotion/entity/publisher.jsonl \
  --install-candidate \
  --target-manifest=src/data/entitySocialCardManifest.generated.json \
  --rollback-manifest=runs/social-card-r2-promotion/entity/rollback.json \
  --verification-ledger=runs/social-card-r2-promotion/entity/verification.jsonl \
  --write --confirm-write=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host> --confirm-bucket=<bucket>
```

## Deploy and verify served tags

Commit the installed manifest and deploy through [deployment](deployment.md). Then run the verifier on the installed manifest without `--objects-only`. For the entity family:

```bash
bun run verify:social-cards -- \
  --manifest=src/data/entitySocialCardManifest.generated.json \
  --ledger=runs/social-card-r2-promotion/entity/verification.jsonl \
  --run-id=<deployment identities>
```

It rechecks every object. For each manifest entry whose top-level key is `replications` or `contributors`, it also checks the page's canonical URL, `og:image`, and `twitter:image` on `https://dose.wiki` and `https://effectindex.com`. `--host` replaces those hosts. The substance manifest has no such entries, so its run checks objects only. The page manifest is flat: its `replications` key is the gallery card, not a replication, so the verifier checks page objects only and no page route.

Check page tags by hand on the dose.wiki hosts. On `https://dose.wiki`, open `/` for `home` and `/<key>` for `substances`, `effects`, `replications`, `chemical-classes`, `about`, and `china` (no route uses the `languages` card yet), and confirm `og:image` and `twitter:image` name the manifest's URL for that key. Repeat for `home`, `substances`, `effects`, `replications`, `chemical-classes`, and `about` on `https://ru.dose.wiki` and `https://zh.dose.wiki`, which serve the same cards; `china` exists only on `https://dose.wiki`. Group routes under substances and effects reuse those two cards and need no separate check. Effect Index never serves page-manifest cards (`pageSocialCardUrl` returns null there) and shows its fallback image instead, which is correct.

If the verifier or a manual page check fails, restore the previously committed manifest and redeploy.
