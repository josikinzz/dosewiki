# Approved contributor profile merge executor

This executor is restricted to `WHERESSUEDE` → `LOKA` and `WOOODFIELD` → `PHOSFORM` on production deployment `glad-minnow-656`. It is dry-run-only unless all production write gates are supplied. It never prints or stores the admin token.

Run from the repository root after fetching and reconciling the latest `origin/main`. Put the scoped credential in the environment, not a command argument:

```sh
export CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE='clipboard-secret'
```

Authenticated dry run of both pairs:

```sh
node scripts/contributors/apply-approved-profile-merges.mjs \
  --target-url=https://glad-minnow-656.convex.cloud \
  --expected-deployment=glad-minnow-656 \
  --actor-email=contact@dose.wiki
```

Apply the LOKA canary only. The executor always repeats the dry run immediately before the write and requires an exact authenticated receipt afterward:

```sh
node scripts/contributors/apply-approved-profile-merges.mjs \
  --target-url=https://glad-minnow-656.convex.cloud \
  --expected-deployment=glad-minnow-656 \
  --actor-email=contact@dose.wiki \
  --only=loka \
  --write \
  --confirm-write=apply-approved-contributor-profile-merges
```

Apply PHOSFORM only after the LOKA receipt is verified in the append-only campaign ledger:

```sh
node scripts/contributors/apply-approved-profile-merges.mjs \
  --target-url=https://glad-minnow-656.convex.cloud \
  --expected-deployment=glad-minnow-656 \
  --actor-email=contact@dose.wiki \
  --only=phosform \
  --write \
  --confirm-write=apply-approved-contributor-profile-merges
```

Re-running either write command is the supported resume path. It verifies the deterministic operation's server receipt and does not repeat an already applied mutation.

Preview rollback in reverse application order:

```sh
node scripts/contributors/apply-approved-profile-merges.mjs \
  --target-url=https://glad-minnow-656.convex.cloud \
  --expected-deployment=glad-minnow-656 \
  --actor-email=contact@dose.wiki \
  --rollback
```

Apply rollback only after reviewing the generated rollback manifest:

```sh
node scripts/contributors/apply-approved-profile-merges.mjs \
  --target-url=https://glad-minnow-656.convex.cloud \
  --expected-deployment=glad-minnow-656 \
  --actor-email=contact@dose.wiki \
  --rollback \
  --write \
  --confirm-write=rollback-approved-contributor-profile-merges
```

Artifacts default to the `Replication Identity and Social Pass 2026-08-31` campaign directory:

- `approved-contributor-profile-merge-ledger.jsonl` is append-only production evidence.
- `approved-contributor-profile-merge-dry-run.json` records deterministic reviewed inputs and server preview results.
- `approved-contributor-profile-merge-rollback-manifest.json` lists verified operations in reverse order with deterministic rollback IDs.

Test without network access:

```sh
node --test scripts/contributors/apply-approved-profile-merges.test.mjs
```
