# Reddit replication intake

Status: working runbook. This is not a completion report or production authorization.

Use this runbook for the 2026-08-30 Replication Index campaign and for later
Reddit discoveries. It joins the private archive and review workflow to the
R2-first Dose Wiki application without making the archive package itself a
production client.

## Fixed boundaries

- Convex `prod:glad-minnow-656` remains the source of truth for metadata. R2
  stores immutable media bytes under content-addressed keys.
- Preserve existing Convex Storage IDs and direct URLs as rollback sources.
- SSD originals and archive blobs are immutable. Never rename, move, overwrite,
  transcode in place, or delete them.
- Keep the Reddit submitter, creator evidence, public profile, and rights
  evidence as separate structured facts. For the owner-directed 2026-08-31
  remediation, use a named poster as the public artist by default, except where
  item-specific evidence establishes another creator, collaboration,
  collective, traditional attribution, or process/system credit. This public
  artist default does not assert that the poster is the legal rightsholder.
- Rights default to `unknown`. Public availability, attribution, or a working
  URL is not publication permission; never promote uncertainty to a permission,
  license, ownership, or public-domain claim.
- For the 2026-08-30 campaign, the owner's pinned 2026-08-31 decision makes
  rights attribution metadata rather than a publication gate. Dose Wiki may
  host the archive for educational and archival purposes under its fair-use
  position, does not claim ownership, and recognizes that the original creator,
  owner, or rightsholder retains their rights. Fair use is use-specific and is not
  guaranteed legal clearance.
- Preserve the best-known creator, rightsholder, source, and attribution; label
  unresolved ownership `unknown`. Route correction, reattribution, and removal
  requests to `contact@dose.wiki`.
- Static Reddit-scrape images whose longest edge is 400 px or smaller remain on
  the publication hold. GIFs, videos, and the original collection are outside
  that specific hold.
- Videos longer than five minutes remain publication-ineligible for this
  campaign.
- Dry runs, plans, local derivatives, credentials, and successful mutations do
  not prove public completion.

Read `AGENTS.md`, `CONTEXT.md`, the
[classification field guide](replication-classification-guide.html), the
[R2 migration record](convex-to-cloudflare-r2-media-handoff.md), and the campaign
index and pinned rights/publication policy at
`/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/README.md`
and
`/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/publication-rights-policy-2026-08-31.json`
before starting.

## One pipeline, one gate at a time

Do not skip forward. Each stage consumes a frozen artifact from the previous
stage and emits a reviewable artifact for the next.

### 1. Freeze the input set

1. Stop acquisition or name a new incremental cutoff.
2. Build a schema-v2 campaign manifest from the current archive, reviewed tags,
   thumbnail hold, R2 inventory, and exact application commit.
3. Verify every pinned file's SHA-256 and record the target deployment.
4. Create a fresh pre-write Convex table export without file storage.

Gate: one campaign ID, one canonical manifest, one application commit, one
deployment, and zero unexplained digest drift. A changed input starts a new
freeze; never patch around the mismatch.

### 2. Finish media review

Resolve late assets, verdict conflicts, and effect/viewing-mode conflicts using
the full media and distinct secondary or tertiary reviewers where required.
Keep unclear, not-replication, held, invalid, and exact-live-overlap rows visible.
Merge review results, then regenerate and re-hash the schema-v2 campaign.

Gate: one canonical row per media SHA-256, complete review trails, exact final
disposition counts, and no unresolved review row in the publish set.

### 3. Resolve identity and profiles

For each candidate, record the Reddit submitter separately from the evidence-
backed creator credit. Preserve `Unknown Artist` when evidence is insufficient.
Create or update only reviewed contributor profiles. A profile outcome must be
explicit: matched, reviewed-new, unresolved, or intentionally absent. Record
aliases, public links, avatar provenance, and avatar approval separately.

Gate: every publish candidate has a reviewed creator-credit outcome, best-known
source context, and profile outcome. `Unknown Artist` is an acceptable reviewed
outcome. No style-based identity inference or unreviewed avatar enters a write
plan.

### 4. Record rights and publication basis

Record rights status, best-known rightsholder evidence, source, credit line,
permission or license detail when evidence exists, publication basis, and the
correction/removal contact. Keep fair use separate from permission, license,
ownership, and public-domain status. Use explicit `unknown` or `unavailable`
values when evidence is insufficient; lack of positive rights resolution does
not block publication in this campaign.

Gate: every publish candidate carries the best-known provenance and attribution,
preserves unresolved ownership as `unknown`, includes `contact@dose.wiki` for
correction or removal, and does not falsely claim clearance. Apply the separate
review, quality, duration, derivative, collision, and production-safety gates.

### 5. Complete metadata and content-family review

Validate stable title and slug, one owning effect, all depicted effect tags,
open-eye or closed-eye viewing mode, title-only drug evidence, content family,
artist-practice taxonomy, provenance, dates, and measured media facts. Validate
every effect against the live effect table. Keep `created_at` distinct from the
work's researched date.

Gate: the metadata projection has no missing required field, invalid enum,
unknown effect, duplicate slug, duplicate SHA, or unreviewed content-family
decision among publication-eligible rows.

### 6. Generate and validate derivatives

Use the pinned derivative policy and the offline, SHA-keyed generator in the
Media Review workspace. Never upscale or modify a source. Emit a derivative
manifest containing source SHA-256, role, recipe, output SHA-256, media facts,
local path, and intended R2 key. Decode every static image; verify GIF motion and
poster pairs; probe and seek video mains, posters, and full-span previews.

Gate: zero missing, failed, held, over-duration, or source-modified rows in the
publication derivative set.

### 7. Put bytes in R2

Upload only files declared by the frozen derivative manifest. Keys must use
`media/sha256/<first-two>/<sha256>.<ext>`. Use bounded, resumable copies; never
use `sync` or delete flags. Verify object presence, length, content type, inline
disposition, immutable caching, range requests, and downloaded SHA-256.

Gate: every planned media role has exactly one verified R2 key and no credential
appears in a client bundle, row, log, report, or commit.

### 8. Build the import plan and ledger

The plan must emit explicit `create`, `existing`, `exclude`, `hold`, `conflict`,
and `blocked` actions from pinned inputs. Bind it to its SHA-256, target commit,
deployment, expected live snapshot, and expected counts. Use the guarded
R2-native insert contract; do not manufacture a Convex Storage upload merely to
make an R2-backed row insertable.

Create a separate resumable ledger before the first write. Record operation ID,
plan digest, row ID, slug, source SHA, every R2 key, prior values, new values,
status, verification, error, and timestamps. Persist progress atomically after
each state transition.

Gate: a zero-write dry run has exact counts, zero collisions, zero missing media,
zero held items, zero unresolved required fields, and no stale live snapshot.

### 9. Canary

Run `npm run convex:doctor`, set `TARGET_CONVEX_URL` explicitly, and confirm
`glad-minnow-656`. Select a small canary covering image, video, GIF, new profile,
existing profile, multiple effects, and explicit unknown-rights labeling. Read
back every field, attribution, publication basis, contact, and resolved URL;
decode or play every asset; confirm no held row appears.

Gate: the ledger, Convex row, R2 objects, public API, and rendered record agree.
Any mismatch stops the campaign and uses the rollback section below.

### 10. Import bounded batches

Process only pending ledger rows. Use compare-and-set expectations and bounded
reads; never repeat a verified row or skip an error. After each batch, reconcile
expected and stored rows, R2 keys, profiles, effects, rights, and publication
state. Stop on drift.

Gate: every batch is fully verified or explicitly failed before the next begins.

### 11. Rebuild and verify both public sites

After the canary and each publication milestone, rebuild the Dose Wiki and
Effect Index deployments from the pinned commit. Verify `dose.wiki`, artist and
effect pages, direct replication routes, the bounded public API, sitemap, search,
filters, images, GIF controls, video playback and seeking, responsive layouts,
keyboard behavior, focus, captions, and reduced motion. Inspect served HTML for
the expected R2 URLs and confirm held and excluded SHA values are absent.

Gate: Convex read-back, the ledger, both deployments, public totals, served HTML,
and browser behavior reconcile. A green build or HTTP 200 alone is insufficient.

### 12. Close out

Preserve the final plan, ledger, pre- and post-write snapshots, review evidence,
R2 verification, batch reports, deployment IDs, public acceptance results, and
zero-destruction audit together in the campaign directory. Publish a completion
report only after every gate above passes.

## Rollback

Stop new batches first. Use the ledger to restore prior Convex values or remove
only newly created metadata rows through a separately reviewed rollback plan.
Disable R2-first resolution only when the delivery tier itself is failing; the
old Convex Storage IDs and direct URLs remain the global fallback. Rebuild both
sites, inspect served HTML, and record the rollback as a new ledger event.

Rollback does not authorize deletion of R2 objects, Convex Storage objects,
archive blobs, originals, profiles, or review evidence. Storage deletion is a
separate destructive project requiring explicit authorization and its own
inventory and recovery window.

## Later incremental discoveries

Use the bounded Reddit recent-tail workflow from the private archive. Give each
intake a new campaign ID and cutoff, then repeat this entire pipeline from the
freeze. Recompute the thumbnail hold, deduplicate by SHA-256 against the archive
and live corpus, and generate a new plan and ledger. Never append unpinned rows
to a completed campaign or reuse its digest.

## Verification commands

Run checks appropriate to the files changed. The normal application-and-workflow
gate is:

```sh
npm run convex:doctor
npm run verify:all
npm run provenance:check
```

Also run the campaign-specific producer and validator tests from the Media
Review workspace. Save commands, versions, exit codes, exact artifact hashes,
and live verification results in the campaign directory.
