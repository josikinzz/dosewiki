# Replication identity and social projection

This directory converts the reviewed 2026-08-31 campaign artifacts into one deterministic, local-only projection. It does not import Convex code, make network calls, or expose a write mode.

```sh
node scripts/replications/identity-social/build-projection.mjs --check
node scripts/replications/identity-social/build-projection.mjs --dry-run --out /tmp/identity-social-projection.json
node scripts/replications/identity-social/build-projection.mjs --check --projection /tmp/identity-social-projection.json
```

Every operation has an immutable content-derived ID and a canonical JSON SHA-256 expected-before value. Any future production executor must re-query the exact production row, reproduce that hash, and abort on mismatch. The projection explicitly preserves poster and source-post history, limits creator reassignment to the 20 evidence-approved cases, records the other 195 research outcomes as no-change decisions, and leaves owner-review alias candidates blocked.

Avatar projection uses `avatar-candidate-second-review.json` as its sole decision authority. It emits exactly seven approved profiles; rejected FishCenterNicole and Nervewing remain only in the source review ledger. Loka, Phosform, and Symmetric Vision are included through their independently approved derivatives rather than through a parallel staging path. Replacement proposals include the current avatar SHA-256 in their expected-before snapshot so later execution must preserve history and abort if that avatar has drifted.

## Approved avatar object publication

`publish-avatars.mjs` publishes only those seven approved WebP derivatives. It is
local-only by default and is deliberately separate from the later Convex metadata
projection:

```sh
# Local hashes and deterministic plan only: no network and no writes.
node scripts/replications/identity-social/publish-avatars.mjs

# Read-only full-byte R2/CDN preflight. This may append observations to the
# resumable JSONL ledger, but performs no object, manifest, metadata, or Convex write.
node scripts/replications/identity-social/publish-avatars.mjs --preflight-r2
```

The plan prints both `projectionSha256` and `planDigest`. An eventual write must
repeat those exact values and the intended storage identities; placeholders below
must be replaced with the values printed by the immediately preceding dry run:

```sh
# Canary: an explicit approved profile is mandatory.
node scripts/replications/identity-social/publish-avatars.mjs \
  --write --phase=canary --canary-profile=JOSIE \
  --confirm-operation=publish-approved-avatars \
  --confirm-projection='<projectionSha256>' --confirm-plan='<planDigest>' \
  --confirm-target='replications-r2:replications' --confirm-bucket=replications

# Full run: refused until the same append-only ledger proves that exact plan's canary.
node scripts/replications/identity-social/publish-avatars.mjs \
  --write --phase=full --resume \
  --confirm-operation=publish-approved-avatars \
  --confirm-projection='<projectionSha256>' --confirm-plan='<planDigest>' \
  --confirm-target='replications-r2:replications' --confirm-bucket=replications
```

Objects use `media/sha256/<prefix>/<sha>.webp`. Existing objects are streamed in
full through `rclone cat` and must match both reviewed SHA-256 and byte length;
any mismatch is an immutable collision and stops the run. Every accepted object
is then fetched from the public CDN and yields the server-compatible receipt
fields `url`, `content_sha256`, `byte_size`, `http_status`, `verified_at`,
`verifier`, and `receipt_digest`. The receipt digest covers a canonical form of
all preceding receipt fields.

The ledger is append-only and permits exact-plan resumption. Content-addressed
objects are immutable and are never deleted by this workflow. Rollback means
reverting the later metadata/manifest reference using its separately recorded
prior state; it never means deleting an uploaded object.

Alias decisions require both the independent mapping review and `full-production-collision-audit.json`. The authoritative 2,119-profile audit supersedes the earlier 152-profile assumption: WHERESSUEDE and WOOODFIELD already exist as separate profile rows, so both are blocked merge-required collisions rather than alias additions. A future merge must be lossless, typed, separately approved, and guarded by full profile-set CAS digest `aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d`. Existing StingrayZ remains a no-write preservation decision; Xanny and Sunterry remain blocked.

## Guarded Convex executor

`executor.mjs` is the only projection-to-Convex bridge. It defaults to a local
dry run and records every non-actionable projection operation as an explicit
no-write. Avatar and social-asset operations remain no-writes until an external
delivery-receipt JSON maps their operation ID (or media SHA-256) to a verified
CDN receipt.

Build the executor-compatible receipt document only after both immutable R2
publishers have completed:

```sh
node scripts/replications/identity-social/build-delivery-receipts.mjs \
  --output=/absolute/path/to/identity-social-delivery-receipts.json
node scripts/replications/identity-social/build-delivery-receipts.mjs \
  --output=/absolute/path/to/identity-social-delivery-receipts.json --check
```

This makes no production writes. It requires the completed seven-object avatar
ledger and 9,171-object social-card ledger, binds them to all 9,179 projection
operations, and streams every distinct CDN object to verify its full byte count
and SHA-256. It preserves `verified-reuse` versus `uploaded-verified` and fails
closed on missing objects, collisions, plan drift, or ambiguous entity/key
bindings. Publication timestamps make unchanged-input reruns deterministic.
Pass the output to the executor with `--delivery-receipts=<path>`.

```sh
npm run replications:identity-social:execute -- \
  --projection-digest=<exact-current-projection-sha256>
```

Write mode additionally requires `--write`,
`--confirm-write=apply-identity-social-projection`,
`--expected-deployment=glad-minnow-656`, the exact `--projection-digest`, a
registered `--actor-email`, the explicit `TARGET_CONVEX_URL`, and the
`replicationMaintenance` credential. Write mode also requires
`--phase=canary` first; `--phase=full` is refused until the ledger proves one
readback-verified canary for every actionable mutation class. Before each batch, the executor calls
`previewCanonicalBefore` for every item and compares both the canonical value
and digest. Homogeneous batches contain no more than 50 records or 512,000
canonical JSON bytes.

The local append-only JSONL ledger resumes only batches whose server operation
and item-count readback succeeded. A reverse-order rollback manifest is emitted;
`--rollback` invokes the server's CAS-protected rollback mutation. Any wrong
target, operation collision, identity ambiguity, absent receipt, CAS drift,
write error, or readback discrepancy stops the run. Dry-run output identifies
one deterministic canary per actionable mutation class; those canaries must be
run and verified before the remaining batches.
