# Replication identity and social projection

This directory turns the reviewed identity, rights, avatar, attribution, and
social-card inputs into one deterministic projection. The inputs and immutable
delivery receipts are current workflow dependencies. Completed campaign
chronology and execution diaries stay in the private campaign archive.

## 1. Build the projection

Projection building is local-only and has no network or write mode:

```sh
node scripts/replications/identity-social/build-projection.mjs --check
node scripts/replications/identity-social/build-projection.mjs \
  --dry-run --out /tmp/identity-social-projection.json
node scripts/replications/identity-social/build-projection.mjs \
  --check --projection /tmp/identity-social-projection.json
```

Complete this step when every operation has a content-derived ID and canonical
expected-before SHA-256, all source and poster history is preserved, every
creator or profile change is evidence-approved, and unresolved alias or rights
decisions remain explicit no-writes.

## 2. Publish approved immutable objects

`publish-avatars.mjs` is local-only by default. Its R2 preflight may append
observations to the resumable ledger but performs no object or metadata write.

```sh
node scripts/replications/identity-social/publish-avatars.mjs
node scripts/replications/identity-social/publish-avatars.mjs --preflight-r2
```

An approved write requires the exact immediately preceding projection and plan
digests, explicit R2 target and bucket, and canary completion before full mode.
Objects use `media/sha256/<prefix>/<sha>.webp`. Existing objects must match the
reviewed hash and byte length. Rollback restores metadata references and never
deletes content-addressed objects.

## 3. Build delivery receipts

Run this only after the immutable R2 publishers and their full-byte verification
ledgers are complete:

```sh
node scripts/replications/identity-social/build-delivery-receipts.mjs \
  --output=/absolute/private/path/identity-social-delivery-receipts.json
node scripts/replications/identity-social/build-delivery-receipts.mjs \
  --output=/absolute/private/path/identity-social-delivery-receipts.json --check
```

Complete this step when the sidecar binds every actionable projection operation
to one verified object and its `receiptSidecarSha256`, with no missing,
duplicate, ambiguous, hash-mismatched, or byte-total-mismatched receipt.

## 4. Dry-run and execute metadata

`executor.mjs` is the only projection-to-backend bridge. The historical command,
function-reference, and `replicationMaintenance` intent-token names remain exact
compatibility contracts. Production selects Postgres:

```sh
export DATA_BACKEND=postgres
export TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL"
export POSTGRES_IMPORT_CONFIRM=aws-us-east-1-2.pg.psdb.cloud
npm run postgres:check-env-isolation
npm run replications:identity-social:execute -- \
  --projection-digest=<exact-current-projection-sha256> \
  --delivery-receipts=/absolute/private/path/identity-social-delivery-receipts.json \
  --receipt-sidecar-digest=<exact-receiptSidecarSha256> \
  --expected-deployment=aws-us-east-1-2.pg.psdb.cloud/postgres --allow-remote
```

Inspect that no-write plan first. A separately approved write adds `--write`,
`--confirm-write=apply-identity-social-projection`, the registered
`--actor-email`, and `--phase=canary`. Full mode remains refused until the
append-only ledger proves a readback-verified canary for each mutation class.
CAS drift, wrong target, operation collision, absent receipt, write error, or
readback mismatch stops the run.

## 5. Completion proof

The read-only completion command uses the same explicit Postgres target,
deployment fingerprint, `--allow-remote`, actor, projection, receipts, and
private output destination. Completion requires every expected journal receipt
and current target value to match the immutable projection. Preserve the final
projection, source and rights evidence, receipt sidecar, append-only ledger,
readback proof, and reverse-order rollback manifest privately.
