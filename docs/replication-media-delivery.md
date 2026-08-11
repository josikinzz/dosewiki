# Replication Media Delivery — Transcode, Archive, and Repoint

Last verified: 2026-08-11

The replication corpus is 247 rows: 125 videos totalling 44.62 GB of raw,
never-transcoded masters, and 122 images totalling 235 MB. Video playback was
slow, and **almost none of those bytes lived on production**. This document is
the plan for both problems, the decisions that shape it, and the two ways a naive
version of it fails silently.

Three scripts implement it:

| Step | Script | Writes |
| --- | --- | --- |
| 1. Rescue (+ encode, video only) | `scripts/replications/archive-replication-masters.mjs` | local files only |
| 2. Encode engine | `scripts/replications/transcode-videos.mjs` | local files only |
| 3. Upload + repoint | `scripts/replications/repoint-renditions.mjs` | **production Convex** |

## Status

**Done. The rescue is complete for both halves of the corpus.**

| Half | Rescued | Rows repointed | Result |
| --- | --- | ---: | --- |
| Video | 2026-08-10 | 125 | all media and posters on `glad-minnow-656` |
| Image | 2026-08-11 | 106 | all media and thumbnails on `glad-minnow-656` |

Measured against production on 2026-08-11 after the image run: **0 of 247 rows
resolve to an orphan or development host, and 0 resolve to null.** The stored
`url` strings still name the old hosts on 172 rows; that is deliberate and is the
rollback path (section 5).

The remainder of this document is kept as the record of *why* it is shaped the
way it is. Everything below still applies to a re-run.

## Corrections to earlier readings of this corpus

- **`notes-and-plans/reports/replication-provenance/audit-latest.json` is stale
  and has now misled three separate readings.** It was generated against
  `VITE_CONVEX_URL` — the *development* deployment — so its resolved URLs
  describe dev, not production. Do not quote it for host or poster questions.
  Re-measure against production.
- **Posters are fine.** All 125 videos resolve a `thumbnail_url` on production
  and every row carries a `thumbnail_storage_id`. An earlier claim that 60 rows
  had no poster came from the stale audit and was wrong. Posters are not a
  problem and not a decision.

## 1. How a video URL reaches the browser

The important finding first: **no application code in this repository ever
constructs, rewrites, prefixes, or proxies a replication media URL.** There is no
media proxy route, no `next/image` loader, no rewrite, no CDN prefix. The URL
that lands in the `src` attribute is produced entirely inside Convex and passed
through untouched.

| Step | Location |
| --- | --- |
| URL produced | `convex/replications.ts:77-114` `resolveReplicationUrls` |
| Queries | `getBySlug` (`:133`), `getReplicationsByEffect` (`:163`), `getByArtist` (`:191`), `getPublicReplications` (`:331`) |
| Transport | `lib/convex/serverClient.ts:56-73` `queryConvex` |
| Adapter | `lib/convex/publicData.reads.ts:664-688` |
| Cache | `lib/convex/publicData.effects.ts:46-65` — `unstable_cache`, revalidate 900 s, tags `convex-public` / `convex-public:replications` |
| Route loader | `lib/next/routeLoaders.tsx:435-486` `loadReplicationRoute` |
| Page | `src/app/replications/[slug]/page.tsx` (`revalidate = 3600`, `dynamicParams = false`) |
| Element | `src/features/effects/pages/ReplicationDetailPage.tsx:125-133` |

Two further `<video>` elements consume the same shape:
`src/features/effects/gallery/GalleryMediaTile.tsx:126-138` and
`src/features/effect-index/home/FeaturedReplicationsPanel.tsx:142-153`. Both are
client components fed by a server read — no client `useQuery` touches
replications anywhere.

### The resolver, which is the whole integration surface

`convex/replications.ts:89-99`:

```ts
if (!isPlaceholderStorageId(rep.storage_id)) {
  try { url = await ctx.storage.getUrl(rep.storage_id); } catch {}
}
if (!url && rep.url) { url = rep.url; }
```

The doc comments at `:129-131`, `:159-161` and `:189-191` claim the opposite
precedence ("1. Direct `url` field, 2. Convex storage lookup"). **The code is
authoritative and those comments are wrong: `storage_id` wins, and the stored
`url` string is only reached when the storage lookup yields nothing.** Section 5
explains why that single fact decides the shape of the migration. Fixing the
comments is part of the work.

### Consequences worth knowing before changing anything

- **A null URL deletes the page.** `lib/next/routeLoaders.tsx:453` returns
  `not-found` when `replication.url` is falsy, and
  `lib/next/publicRoutePlan.ts:205-212` filters unresolvable rows out of
  `generateStaticParams`. With `dynamicParams = false`, a row that fails to
  resolve at build time has no page at all. **The blast radius of a botched
  repoint is page removal, not a broken video.**
- **Resolved URLs are cached twice** — 900 s `unstable_cache`, then ISR HTML at
  3600 s. Cutover is not instant; `revalidateTag("convex-public:replications")`
  (tag defined at `lib/convex/publicData.cache.ts:3-15`) forces it.
- **CSP already permits any HTTPS media host** —
  `lib/next/cspObservationPolicy.ts:158-160`. No CSP work needed.
- **`next/image` is not in the path.** `src/components/common/AppImage.tsx:20-22`
  treats only local paths as optimizable, so remote posters already render
  through a plain `<img>`. That is why the absent `images.remotePatterns` has
  never broken anything.

## 2. Decision: no CDN. Convex stays the origin.

The owner was offered Cloudflare R2, Bunny.net, and Vercel Blob, and declined
all three: *"convex??? its been working well enough"*. That decision is recorded
here as final for now, along with what it does and does not buy.

### What the transcode fixes

- **Bytes per view.** 44.62 GB of masters become roughly 5 GB of renditions
  (see section 4). A p90 file drops from 984 MB to tens of MB; the 4.80 GB
  outlier drops by well over an order of magnitude.
- **Time to first frame.** Every rendition is written with
  `-movflags +faststart`, so the `moov` atom leads. Measured on a proof encode:
  a master needed 170,469,032 bytes fetched before the `moov` appeared; the
  rendition has everything needed to start decoding within the first 6,918
  bytes.
- **Decodability.** Every rendition is H.264 High / yuv420p, which no browser
  refuses. Masters in the corpus include pixel formats browsers cannot decode.

### What it does not fix, and nobody should later read this doc as if it did

- **No shared cache.** Convex storage returns
  `cache-control: private, max-age=2592000` (measured on production
  2026-08-11). `private` bars every *shared* cache — CDN edges, proxies,
  anything between the origin and one particular browser — so **each new
  viewer pulls the full rendition from origin**. Ten simultaneous first-time
  viewers are ten origin fetches.
- **Per-browser caching does work**, and it is worth being precise about this
  rather than repeating the pessimistic version: the 30-day `max-age` means a
  returning viewer replays from their own disk cache and does not re-download.
  The cost falls on first views, not repeat ones.
- **Single origin, single region.** Geographic latency is unchanged.
- **Bandwidth cost scales with *distinct* viewers**, with no shared cache to
  amortise it across them.

The honest summary: the transcode removes roughly 90% of the bytes and
essentially all of the start-up stall, which is the bulk of the felt problem.
The remaining inefficiency is that the first view by each visitor is served
from origin at full size. That is acceptable at current traffic and becomes the
thing to revisit if traffic grows or if Convex ever exposes a public
cache-control.

### Reference, if that decision is ever revisited

Kept deliberately, so a future reader does not have to re-derive it. A CDN would
need the origin to return:

| Header | Value | Why |
| --- | --- | --- |
| `Cache-Control` | `public, max-age=31536000, immutable` | The fix for the measured `private`. Safe only with content-addressed keys. |
| `Content-Type` | `video/mp4` | Object stores often default to `application/octet-stream`, which downloads instead of playing. |
| `Accept-Ranges` | `bytes` | Seeking. Convex already answers 206, so this is parity. |
| `Access-Control-Allow-Origin` | not required | The `<video>` elements carry no `crossorigin`, so playback is a no-CORS media fetch. |

Note also that a CDN *in front of Convex storage* does not work:
`ctx.storage.getUrl` returns a signed, expiring URL, so the cache key is unstable
and the cached target expires. Moving to a CDN means moving the bytes.

## 3. Where the media actually lived

### Video — measured 2026-08-10, over the 125 video rows

| Asset | Host | Count |
| --- | --- | ---: |
| video | `glad-minnow-656` (production) | 60 |
| video | `warmhearted-mosquito-204` (orphan) | 59 |
| video | `adept-goldfish-624` (orphan) | 6 |
| thumbnail | `glad-minnow-656` (production) | 60 |
| thumbnail | `enchanted-echidna-791` (**development**) | 65 |

The 59 + 6 = 65 orphan-hosted videos line up exactly with the 65 rows whose
`storage_id` starts with `placeholder-`. For those rows `resolveReplicationUrls`
can never take the storage branch, so the literal `url` string — an absolute URL
on a deployment this project does not own — is what every visitor fetches.

**By bytes the split is far worse than by count: 44.19 GB sits on the two orphan
deployments and only 431 MB on production.** The two largest single files —
4.80 GB `dmt-breakthrough-symmetric-vision` and 4.79 GB
`deliriant-replication-compilation-various-artists` — each exceed everything
production holds.

`warmhearted-mosquito-204` appears nowhere in `convex/`, `src/`, `lib/`,
`scripts/`, or any config. It is not a configured fallback. It is a hostname
sitting in production data.

**Why this is urgent independent of every other decision:** there is no admin
credential here for either orphan deployment, and `enchanted-echidna-791` is a
development deployment, which get reset as a matter of routine. An HTTP GET is
the only way to obtain any of those bytes. If any of the three is reset or
deleted, those files are gone — not degraded, gone, with nothing able to
re-derive them.

### Images — measured 2026-08-11, over the 122 image rows

The video rescue left this half untouched, and it was in the same danger.

| Asset | Host | Count |
| --- | --- | ---: |
| image | `warmhearted-mosquito-204` (orphan) | 79 |
| image | `adept-goldfish-624` (orphan) | 26 |
| image | `glad-minnow-656` (production) | 17 |

166 MB of the 235 MB corpus sat on the two orphan deployments. All 105 endangered
rows were reachable by HTTP GET, their recorded `file_size` matched
`Content-Length` exactly in every case, and their recorded `format` matched the
served `Content-Type` in every case.

**A row is not the unit of risk, and this half proves it.** Counting only the
media URL says 105 rows are endangered. Counting *assets* says 106:
`shadow-people-figure-in-a-doorway` already resolved its image from production
while its `thumbnail_url` still resolved from `warmhearted-mosquito-204`. A skip
rule that asked only about the media declared that row rescued and left the
orphan reference in place, where the gallery and `lib/public-api/v1.ts` would go
on handing it out. `planRepoint` therefore skips a row only when **every** asset
it references is already on production.

### Two things about image rows that shape the operation

- **`thumbnail_url` is normally the same stored object as `url`.** 104 of the 105
  endangered rows held two identical URL strings. Uploading that twice would
  double the bytes on production and leave two ids free to drift apart, so both
  fields are pointed at one upload instead. `GalleryMediaTile` reads `url` for
  images and `thumbnail_url` only for videos, but `replicationDetailModel`,
  `replicationCredit`, and the public API all read `thumbnail_url`, so leaving it
  on an orphan host would not have been cosmetic.
- **A row's `format` can be wrong.** `shadow-people-figure-in-a-doorway` carries
  `format: "jpg"` on a thumbnail whose stored object is a WebP. Convex serves
  back whatever `Content-Type` an upload declares, so trusting the row would have
  published a WebP as `image/jpeg` — which makes browsers download the file
  instead of rendering it. The upload type is resolved from the file's own
  container signature first, the source response header second, the name third.

## 4. Step 1 — archive the masters and encode renditions

`scripts/replications/archive-replication-masters.mjs`. Local only; no Convex
write. `--media-type` selects the half of the corpus; video is the default.

Per row, strictly one row at a time: **fetch master to scratch → transcode →
copy master to the archive volume → release scratch.** Peak local scratch stays
near the largest single file (~4.8 GB) rather than the 44.6 GB corpus.

### Why images skip the transcode

Videos were re-encoded because the masters were undecodable in some browsers,
multi-gigabyte, and non-faststart — a rendition fixed a measurable delivery
problem. Images have none of those problems: 235 MB in total, and several rows
are third-party artworks where a re-encode, a resize, or a metadata strip is an
attribution problem as much as a quality one. **Image masters are archived and
re-uploaded byte for byte, and the archived master is what production serves.**
ffmpeg is never invoked on an image run, and `--output-dir` is not required.

Images archive under their own `image/` prefix so an image slug can never collide
with a video master or poster sharing the same name.

### Destination

`/Volumes/DeepSeek` — external drive, exFAT, 931 GB total, ~639 GB free measured
by `statfs` against 44.62 GB of masters. There is no space pressure and
therefore no prioritisation scheme: **archive order is plain slug order**, which
keeps each row's video and poster adjacent and makes an interrupted run resume
at an obvious place.

The free-space machinery is kept anyway, because it is correct regardless of
which volume is attached:

- Whole-job budget check before the first fetch, holding a 1 GB reserve back so
  a write never fails with no room to clean up after itself.
- Real `statfs` re-measured immediately before every individual archive write —
  the plan uses `file_size`, which is optional in the schema and unreliable.
- Running out of room is an **orderly, resumable stop**: the fetched master is
  left in scratch so the next run archives it without re-downloading gigabytes,
  and the manifest names exactly what was and was not archived.

Verified against the live drive: 639.1 GB free, 1.1 GB reserve, 44.62 GB to
copy, **593.4 GB headroom, shortfall 0.**

### exFAT properties handled deliberately

- **Case-insensitive filenames.** exFAT preserves case but compares without it,
  so two archive names differing only by case are one file and the second write
  silently destroys the first master — precisely the failure this whole exercise
  exists to prevent. `detectArchiveCollisions` folds every archive path and
  **aborts the entire run before a single byte is fetched** if any two collide.
  Exact duplicate slugs are caught by the same check, which matters because the
  corpus is known to contain rows sharing a slug. Verified: the real corpus is
  clean; an injected `Tracers-Chelsea-Morgan` / `tracers-chelsea-morgan` pair is
  detected and fatal.
- **No POSIX permissions, ownership, symlinks, or hard links** (`noowners`).
  Nothing relies on any of them; integrity is proven by sha256 digest, not by
  filesystem metadata.
- **No 4 GB file-size limit** — that is FAT32, not exFAT. The 4.80 GB and 4.79 GB
  masters write fine. This was worth confirming rather than assuming; on FAT32
  those two files would have been unstorable.

### Integrity

Downloads land on `.part` and are renamed only once the byte count matches
`Content-Length`. Archive copies land on `.part`, are sha256-compared against the
source, and are renamed only on a match. Scratch is released only after the
archive copy is proven. There is no path that leaves a partial file where a
whole one is expected.

### Encode settings

From `transcode-videos.mjs`, unchanged: H.264 High, `-crf 21`, `-preset medium`,
long edge capped at 1920 with no upscaling, `-pix_fmt yuv420p`, AAC-LC 128 kbps
stereo or `-an` when the master is silent, frame rate untouched,
`-movflags +faststart`. Three actions per file — `transcode`, lossless `remux`
(right codec, wrong container or trailing `moov`), or verbatim `copy` (already a
faststart web MP4). Rationale for each setting is in the script header.

**Projected corpus size after transcode: roughly 3–8 GB, central ~5 GB (~9:1).**
Output size is bitrate × duration and is independent of source size; at 1080p
CRF 21 the encoder lands 4–6.5 Mbps, i.e. 0.5–0.8 MB per finished second. The
unknown is total corpus duration, which the dry run computes exactly from
`ffprobe`. The script reports a band rather than a single figure and replaces
estimates with measured bytes as files land.

## 5. Step 2 — upload to production and repoint

`scripts/replications/repoint-renditions.mjs`. **This is a production Convex
write.** Run against video on 2026-08-10 and against images on 2026-08-11.

This step is the real prize: for video it fixes size, fixes faststart, **and
retires both orphan deployments plus the dev-hosted thumbnails in one pass**; for
images it is the rescue alone. After it, every byte the site serves comes from a
deployment this project controls.

### Trap 1 — writing `url` is a silent no-op on 60 rows

Because `storage_id` outranks `url`, the obvious move — set `url` to the new
location, since `url` is what currently points at the orphan hosts — works for
the 65 placeholder rows and **does nothing at all** for the 60 rows that hold a
live `storage_id`. Those rows keep resolving through storage and keep serving the
old file. A migration that did this and reported success would leave 60 videos
untranscoded with no error anywhere.

The script therefore writes **`storage_id`**, the field that actually wins, via
`api.replications.updateStorageIds`. The choice is expressed as a tested function
(`fieldThatWins()`) rather than a hard-coded call, so if the resolver's
precedence ever changes, a test fails and forces the migration to be re-thought.

### Trap 2 — the blast radius is page removal

Verification therefore treats a null resolved URL as a **hard stop for the whole
run**, not a per-row warning.

### Per-row self-verification

Every row is checked against the resolver's own output — the same query the
website uses — immediately after its write:

1. Re-query `api.replications.getPublicReplications`.
2. **Resolved `url` must be non-null.** Null means the page would be removed.
3. **Resolved `url` must differ from the pre-write value.** This is the clause
   that catches trap 1: a write that landed but changed nothing the browser sees.
4. **Resolved host must be `glad-minnow-656.convex.cloud`** — not an orphan, not
   dev.
5. **Thumbnail must not regress from present to null.**
6. **Resolved thumbnail host must be production**, on every row where this run
   set a thumbnail id. Without it a run that fixed the media and quietly left the
   thumbnail on an orphan host reports success while the rescue is half-done.

All failing clauses are reported together, not just the first. Any failure stops
the run before the next row.

Before each write the script also does a **compare-and-swap check**: it re-reads
the row and aborts if `storage_id` has changed since the reviewed plan was made.
This is script-level only — `updateStorageIds` has no `expectedStorageId`
argument. Adding one (as `applySourceRecovery` already has, at
`convex/replications.ts:660-684`) would make it atomic and is worth doing before
a large run.

### Batching and rollback

- `--batch-size` defaults to 5, with an explicit pause between batches to verify
  against the live site.
- A rollback ledger is written to disk **after every single row**, not at the
  end, recording the previous `storage_id`, `url`, and `thumbnail_url` alongside
  what was applied.
- **The old `url` is deliberately left in place.** It costs nothing and it is the
  rollback path: reversal is one `updateStorageIds` call restoring the previous
  storage id, after which the row falls back to `url` exactly as before. Clearing
  `url` during the migration would turn a reversible change into a one-way door.
  A later cleanup pass can null it once the new storage has been trusted.
- Rows without a usable upload source are skipped, never partially written —
  repointing a row at nothing is exactly how a page gets deleted.
- Uploads retry the **transport** only, eight times with backoff capped at 30 s,
  each attempt on a fresh non-pooled HTTP/1.1 `undici` agent that is disposed
  afterwards. The failure this defends against poisons the connection rather than
  the request: a TLS `bad record mac` was followed by `ERR_HTTP2_INVALID_SESSION`
  on every retry that reused the broken session. The image run hit one `EPIPE`
  and recovered on the next attempt. A non-2xx response is *not* retried — that
  is the server refusing, and hammering it would be wrong.

### Ceremony

Full production write boundary plus an operation-specific confirmation:

```bash
--write \
--confirm-write=repoint-replication-renditions \
--confirm-repoint \
--expected-deployment=glad-minnow-656 \
--target-url=https://glad-minnow-656.convex.cloud
```

Dry run is the default and prints the exact per-row verification it would apply.

## 6. Sequence

1. Attach `/Volumes/DeepSeek`. Dry-run `archive-replication-masters.mjs` (add
   `--media-type=image` for the image half); review the host breakdown, the
   collision check, and the volume budget.
2. Run it with `--write --confirm-archive`. This is the time-critical step: it is
   what removes the risk of permanently losing the bytes to a deployment reset.
3. Review the archive manifest and the corpus projection.
4. `npm run convex:doctor -- --url=https://glad-minnow-656.convex.cloud`. The
   `CONVEX_ADMIN_KEY` in `.env.local` is dev-scoped and **will be rejected by
   production**; take the deployment's own value with
   `CONVEX_DEPLOY_KEY=<CONVEX_DEPLOY_KEY_PROD> bunx convex env get CONVEX_ADMIN_KEY`
   and pass it as `CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE` for the run only.
   Never mint a new key and never write one into a tracked file.
5. Dry-run `repoint-renditions.mjs` and read the plan.
6. Repoint in batches with the full ceremony, verifying each batch on the live
   site before continuing.
7. `revalidateTag("convex-public:replications")` — otherwise the 900 s
   `unstable_cache` and 3600 s ISR keep serving the old resolved URLs. There is
   no standalone endpoint for this; it fires from the authenticated editor write
   routes, or you wait the caches out.
8. Leave the orphan deployments untouched for a defined period. They are the
   rollback.
9. Fix the three wrong precedence comments in `convex/replications.ts`.

## 7. Schema fields that do not exist yet

`convex/schema.ts:362-380` has `width`, `height`, `duration`, `file_size`, and a
`format` extension string. It has **no** mime type, bitrate, codec, rendition
list, or master reference. A migration wanting to record "this row is a
transcoded rendition, its master is archived at X" needs new fields; the
manifests emitted by both scripts carry all of that information.

## Open decisions for the owner

1. **Whether to add `expectedStorageId` to `updateStorageIds`**, making the
   compare-and-swap atomic rather than script-level. Still script-level today.
2. **How long to leave the orphan deployments alive.** They are the only rollback
   for the 172 rows whose stored `url` still names them.
3. **Whether to null the legacy `url` values** in a later cleanup pass, and when.
4. **`shadow-people-figure-in-a-doorway` has the wrong thumbnail.** Its
   `thumbnail_storage_id` now points at a production copy of
   `b877b211-…` — which is the *`shadow-people-figures-by-a-wall` picture*, not
   its own. The rescue preserved existing behaviour exactly and moved it to a
   host we control; it did not invent a correction, because which thumbnail that
   row should have is a content decision. Likely fixes: clear it so the resolver
   falls through to the row's own image, or point it at the row's own object.
