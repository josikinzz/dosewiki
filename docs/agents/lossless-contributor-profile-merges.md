# Lossless contributor profile merges

This operation is intentionally limited to the two owner-approved, snapshot-pinned pairs:

| Canary order | Redirected source | Canonical target |
| --- | --- | --- |
| 1 | `WHERESSUEDE` (`kx72vtw19621c4kmbwjt0127558dhbvw`) | `LOKA` (`kx77dw7zwgzk9p8byv1b75ny958c9adm`) |
| 2 | `WOOODFIELD` (`kx720hr6135j0rb6mdm85r3mc18dgza9`) | `PHOSFORM` (`kx78gb99p7e7p80q92rrsy5bas8c975b`) |

`STINGRAYZ` is already an alias of `SYMMETRICVISION`; this contract rejects that pair and performs no write.

The mutation never deletes a profile. It retains the source record under its immutable ID and marks it as redirected, unions every source-era handle and stored link into the target, preserves source avatar/profile fields in the redirected row, aggregates verification contributions, and retargets only live profile-ID/key associations (identity attribution, profile binding, and trip-report profile keys). Display names, source URLs, bylines, and source-era artist strings are not normalized away. Every changed row has an exact before/after journal.

## Production sequence

1. Fetch `origin/main`, reconcile concurrent changes, deploy the Convex functions, and confirm the deployed function spec includes `contributorProfileMerges:preview`, `apply`, `receipt`, and `rollback`.
2. Use `preview` with the immutable IDs above, snapshot digest `aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d`, profile count `2119`, a fixed positive `applied_at`, and a 64-zero placeholder expected digest. Save its `state_digest` in the reviewed payload. Preview is an authenticated bounded read and makes no write.
3. Call `apply` with `dry_run: true` and the saved digest. Record the returned payload digest, applied-state digest, and item count. Any state change between preview and dry run aborts.
4. Canary only `WHERESSUEDE` into `LOKA` with `dry_run: false`. Call `receipt`; require `status=applied`, `live_matches=true`, and `checked_items=item_count` before continuing.
5. Verify `/contributors/wheressuede` permanently redirects to `/contributors/loka`; the Loka page retains the canonical avatar and includes both work sets. Verify source display names and URLs remain unchanged on replication details.
6. Repeat dry run, apply, receipt, and public checks for `WOOODFIELD` into `PHOSFORM`. Confirm all four stored links remain in the raw target row even though the current public profile projection displays at most three.
7. Validate both target profiles by immutable ID; both source rows still exist with merge markers; all source identity attributions and profile bindings now reference the target ID; trip-report names are unchanged; source alias/avatar/verification history rows remain attached to the retained source ID; no replication media row or source file changed.
8. Keep the operation IDs and receipt output in the campaign production ledger. Rebuild and verify Dose Wiki and Effect Index from the latest GitHub `main`, not a stale local commit.

## Rollback

Call `rollback` first with `dry_run: true`, then with `dry_run: false`, using a new rollback operation ID and the applied operation ID as `rollback_of`. Rollback refuses if any journaled row drifted. A final `receipt` must report `status=rolled-back` and `live_matches=true`; the source route must resolve to its original source profile again. Never use the older `mergeProfileInto` mutation for these pairs because it deletes the source profile and cannot recreate the same immutable Convex ID.
