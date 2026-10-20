# Social cards

Social cards are the Open Graph and Twitter images for substance, page, and entity routes. Builds never render or upload them. Each family has a tracked manifest that maps a route to an immutable R2 URL, and the phases below replace it. Run them in order, one family at a time. Every phase after the dry run reads or writes R2, and a human approves each run.

| Family | Generator | Manifest | Rendered images |
| --- | --- | --- | --- |
| Substance | `bun scripts/build/generateSubstanceSocialCards.ts --expected-deployment=<fingerprint>` | `src/data/substanceSocialCardManifest.generated.json` | `public/images/social/substances/` |
| Page | `bun scripts/build/generatePageSocialCards.ts [--only=<key>]` | `src/data/pageSocialCardManifest.generated.json` | `public/images/social/pages/` |
| Entity | `bun scripts/build/generateEntitySocialCards.ts --expected-deployment=<fingerprint>` | `src/data/entitySocialCardManifest.generated.json` | `public/images/social/entities/` |

`bun run generate:social-cards -- --expected-deployment=<fingerprint>` runs all three generators in that order with the same arguments.

## 1. Generate

- The substance and entity generators read Postgres through `createDataClient` and stop unless `--expected-deployment` equals the selected source's fingerprint. The error names the fingerprint they found.
- The page generator reads the working tree and the live counts at `https://dose.wiki/api/replications/gallery`. `--only=<key>` renders one card and keeps the other manifest entries.
- The entity generator downloads card media over HTTPS. It renders replication cards only with `GENERATE_REPLICATION_SOCIAL_CARDS=1`; otherwise it keeps the existing replication entries whose slugs are still eligible. `ENTITY_SOCIAL_CARD_OUTPUT_ROOT` and `ENTITY_SOCIAL_CARD_MANIFEST_PATH` redirect its output.
- With `NEXT_PUBLIC_SITE_FLAVOR=effectindex` every generator exits without rendering.

Each generator writes JPEGs under `public/images/social/` (ignored by Git) and overwrites its manifest with local `/images/social/...` paths. That manifest is not deployable until step 5 installs a candidate.

## 2. Plan

```bash
bun run publish:social-cards -- \
  --input-manifest=<manifest> --assets-root=public/images/social \
  --candidate-manifest=<candidate.json> --ledger=<publisher.jsonl>
```

Without `--preflight-r2`, `--apply`, or `--install-candidate` the publisher makes no network request, R2 write, or manifest change. It hashes every local card, carries entries already on the delivery base as published, prints the plan digest, and writes the candidate manifest with R2 URLs and `promotion.planDigest`.

The input and target manifests default to the entity manifest, and the ledgers default to `runs/social-card-r2-promotion/`. Pass `--input-manifest` and `--target-manifest` explicitly for every family.

R2 phases read `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_S3_ENDPOINT`, and `CLOUDFLARE_R2_BUCKET`, and the publisher loads `.env.local` from the working directory. `--rclone-remote=<remote>:<bucket>/<path>` with `--bucket-label=<label>` uses rclone instead. Add `--preflight-r2` to the plan command for a credentialed read that classifies each object as reusable or absent and writes nothing.

## 3. Canary, then full apply

Every apply repeats the plan arguments and adds:

```bash
--apply --confirm-operation=publish-social-cards --confirm-plan=<plan digest> \
  --confirm-target=<endpoint host or rclone remote> --confirm-bucket=<bucket or label>
```

Any confirmation that does not match the current plan and target refuses the run.

1. Canary. Add `--canary=<selectors.json>` or one or more `--canary-selector=<category>:<slug>`. Only those objects are uploaded or confirmed as already present, and no manifest changes.
2. Full apply. Add `--resume`. It refuses unless the same ledger records a completed canary for this exact plan digest.

Objects go to digest-named keys under `media/sha256/`. An existing key with different bytes stops the run with `IMMUTABLE COLLISION`.

## 4. Verify objects

```bash
bun run verify:social-cards -- \
  --manifest=<candidate.json> --ledger=<verification.jsonl> --objects-only
```

This fetches every unique object from the delivery base and checks its digest, length, content type, cache policy, inline disposition, and byte-range support.

## 5. Install the candidate

Repeat the plan arguments and the apply confirmations, and add:

```bash
--install-candidate --candidate-manifest=<candidate.json> \
  --target-manifest=<manifest> --rollback-manifest=<rollback.json> \
  --verification-ledger=<verification.jsonl>
```

Installation refuses without a completed full apply for this plan in the publisher ledger, complete object verification for this plan in the verification ledger, and a candidate carrying the same plan digest. It also refuses if the rollback file exists. It copies the current target to the rollback file, then writes the candidate over the target.

When step 1 wrote to the target path, the rollback file holds that local-path manifest. The previous R2 manifest is the committed version in Git.

## 6. Deploy and verify served tags

Commit the installed manifest and deploy through [deployment](deployment.md). Then run the verifier on the installed manifest without `--objects-only` and with `--run-id=<deployment identities>`. It rechecks every object and, for replication and contributor entries, each page's canonical URL, `og:image`, and `twitter:image` on `https://dose.wiki` and `https://effectindex.com`. `--host` replaces those hosts.

If it fails, restore the previously committed manifest and redeploy.
