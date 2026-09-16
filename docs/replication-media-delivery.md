# Replication Media Delivery — Transcode, Archive, and Repoint

Last verified: 2026-08-30

The replication corpus contains 247 rows: 125 raw, never-transcoded video
masters totalling 44.62 GB and 122 images totalling 235 MB. Video playback was
slow, and **almost none of those bytes lived on production**. This document
records the completed rescue and historical rerun procedure. Current runtime
metadata lives in PlanetScale Postgres; historical hosted-service operations
below are not current operator instructions. Recovery requires a separately
approved isolated historical checkout, never an application environment flip.

Historical rescue scripts and their original write targets:

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

The rest of this document records the decisions behind the completed operation
and its historical rerun requirements; it does not authorize a rerun.

## Current media origin: Cloudflare R2

The media migration completed on 2026-08-30. Since the database cutover,
metadata lives in PlanetScale Postgres and media bytes remain backed by the
existing Cloudflare R2 archive. The implementation and
acceptance record is
`docs/agents/convex-to-cloudflare-r2-media-handoff.md`. The dual-read seam is
live in code:

- Schema: five optional keys — `r2_key`, `thumbnail_r2_key`, `preview_r2_key`,
  `motion_r2_key`, `motion_poster_r2_key`
  (`server/lib/effectMediaSchemaValidators.ts`). Storage IDs, `url`, and
  `thumbnail_url` stay populated as the rollback source.
- Resolution: `resolveReplicationUrls` prefers a valid content-addressed key
  (`media/sha256/<first-two-hex>/<sha256>.<ext>`) joined to the application
  `REPLICATION_MEDIA_BASE_URL`; retained storage identities resolve through
  Postgres `storageObjects`, followed by permitted direct URLs. The media base
  is required at runtime; do not unset it as a recovery shortcut.
- Writes: `replications.updateR2Keys`, compare-and-swap per variant — every
  key travels with the storage ID it was derived from and the batch fails if
  the row was repointed since the plan.
- Tooling: the reviewed historical SHA-256 reconciliation ledger retains digest
  identity, never filename or size. Its hosted-source producers are now
  non-executable references under `scripts/recovery/convex/`.
  `scripts/replications/backfill-r2-keys.mjs` remains the native guarded consumer
  (dry-run default, canary via `--slugs`, existing production-write gates).

The checked-in ledger reconciles 2,804 populated replication media fields with
zero missing, ambiguous, or error results. Its R2 copy verification covers
1,194 distinct Convex-origin objects, including byte-range delivery. The larger
unified archive remains independently verified at 10,150 objects and
215,107,472,061 bytes. Convex Storage IDs and direct URLs remain populated as
rollback sources; deleting those objects was not part of this migration.

Note for reruns of the repoint procedure below: on a row whose `r2_key` is set
while `REPLICATION_MEDIA_BASE_URL` is configured, repointing `storage_id` no
longer changes what the browser sees (`fieldThatWins()` in
`repoint-renditions.mjs` predates the R2 tier). That observation describes the historical rescue tool, not permission to
unset the required runtime media base or invoke a hosted recovery target.

Urgent URL withdrawal is separate from gallery hiding and ordinary outage
rollback. The existing R2 Worker now checks a private per-object withdrawal
marker before serving any GET, HEAD, conditional or range response. Provider
deployment, exact marker-write approval, managed CDN containment and fresh
delivery verification remain required. Follow the
[urgent withdrawal procedure](agents/convex-to-cloudflare-r2-media-handoff.md#urgent-media-withdrawal);
never unset the R2-first switch during an active withdrawal if a native fallback
could re-expose the bytes. Originals and rollback locators remain intact.

Responsive managed raster images use `AppImage` to request the media Worker
directly with `?width=<allowed-width>`. The Worker checks the original object's
withdrawal marker before serving a private WebP rendition from
`_renditions/v1/<original-key>/<width>.webp`. The bucket remains private.
Originals, variants, conditional responses, ranges, and errors all use no-store
headers. A missing rendition is a 404, never a redirect to an unguarded source.

The earlier Next image optimizer design failed the 2026-09-14 real Vercel canary:
its warmed cache bypassed middleware after the Worker returned 410. Managed and
legacy R2 hosts are therefore excluded from Next's optimizer. The native
application optimizes local images only; managed images use the Worker.

New avatar and Studio publication receipts now prepare and verify all responsive
renditions before allowing a database reference to be saved. Preparation streams
the verified original to a private temporary file, uses the same encoder as the
operator command, writes create-only private variants, and checks remote size,
MIME, and digest metadata. Freeze and withdrawal checks remain authoritative;
failure issues no publication receipt. Temporary files are removed on success
and failure. Editor deployment `dpl_3iNngG4UHwBUTovVrs5DkgVMzUuM` carries this
contract in production. The bounded release canary verified 14 new unreferenced
objects, all 13 public responsive widths, both receipt paths, and create-only
replay refusal without creating library or profile records. Evidence:
`runs/postgres-import/2026-09-15T02-25-03Z-integrated-production-release/r2-backend-canary-proof.json`.

For bulk preparation of existing managed raster keys, use
`bun run replications:prepare-image-renditions --keys <keys.json> --out <directory>`.
The input contains a `keys` array of canonical original keys. Preparation only
reads the public Worker and writes local files, verifies source digests, records
missing or withdrawn sources explicitly, and writes a pinned `plan.json`.
Unavailable originals retain their 404 or 410 status rather than receiving a
substitute image. Upload requires the explicit
`--write --confirm-write=upload-r2-image-renditions --bucket=replications
--confirm-plan=<printed-sha256>` flags with the same `--out`. The uploader checks
the write freeze, exact account/bucket, source markers, local hashes, create-only
destinations, and remote size/digest metadata. It never edits article content or
originals. Retain the plan and upload receipts. Verify the public variant URLs
before publishing references to new images.

Animated WebP inputs retain their animation: preparation reads all frames,
and resizing preserves frame delays and loop count without upscaling. Do not
flatten an animated source to bypass a preparation failure.

Previously issued optimizer URLs require provider containment as well as this
source change. The previously installed gate on the three Vercel projects
(`dosewiki-public`, `dosewiki-admin`, and `effectindex`) was
`WITHDRAWAL-REPAIR-1 optimizer source gate`:
deny `/_next/image` requests unless the `url` query value starts with `/` or
`https://glad-minnow-656.convex.cloud/api/storage/`. That historical provider rule allowed
local and hosted-storage sources while blocking managed R2 optimizer inputs.
Native source configuration permits local images only. Source cleanup does
not change the provider rule: reconcile it under explicit provider approval
and verify containment, without reopening any managed-media optimizer path.

Vercel's hard source-image deletion forces foreground revalidation but accepts
only eight exact source URLs per call. Ordinary invalidation can serve stale
bytes; neither enumerating known URLs nor invalidation replaces the edge gate.
Keep historical generated deployment URLs protected. Verify old exact optimizer
URLs, source-query variants, conditional requests, local-image behavior, and
direct Worker delivery after release. Editor local-image checks must preserve
the existing unauthenticated sign-in redirect rather than require HTTP 200.
No server-side mechanism can retract already downloaded or displayed bytes.

## Corrections to earlier readings of this corpus

- **`notes-and-plans/reports/replication-provenance/audit-latest.json` is stale
  and has now misled three separate readings.** It was generated against
  `VITE_CONVEX_URL`, then pointed at development deployment
  `enchanted-echidna-791` (now retired), so its resolved URLs do not describe
  current production. Fresh measurements must use the approved Postgres reader.
- **Posters are fine.** All 125 videos resolve a `thumbnail_url` on production
  and every row carries a `thumbnail_storage_id`. An earlier claim that 60 rows
  had no poster came from the stale audit and was wrong. Posters are not a
  problem and not a decision.

## 1. How a video URL reaches the browser

Video URLs are produced by the canonical resolver and passed to the browser
unchanged. They do not use an image optimizer, proxy route or custom loader.
Responsive still-image delivery is described above.

| Step | Location |
| --- | --- |
| URL produced | `server/lib/replicationUrls.ts:6-52` `resolveReplicationUrls` |
| Query entry points | `server/replications.ts:20-43`; handlers in `server/lib/replicationReads.ts:57-132` |
| Transport | `lib/data/serverClient.ts:57-75` `queryData` |
| Adapter | `lib/data/publicData.reads.ts:705-729` |
| Cache | `lib/data/publicData.effects.ts:143-164`; 900 s and tags are defined in `lib/data/publicData.cache.ts:1-10` |
| Route loader | `lib/next/routeLoaders.replications.ts:57-154` `loadReplicationRoute` |
| Page | `src/app/replications/[slug]/page.tsx:9-99` (`revalidate = 3600`, `dynamicParams = false`) |
| Element | `src/features/effects/pages/ReplicationDetailPage.tsx:155-181` |

Two more `<video>` elements consume the same shape:
`src/features/effects/gallery/GalleryMediaTile.tsx:132-148` and
`src/features/effect-index/home/FeaturedReplicationsPanel.tsx:149-163`. Both are
client components fed by a server read; no client `useQuery` reads replications.

### Immersive viewer playback

The expanded Replication Viewer uses the resolved full-length `url` from its
first frame. It does not replace a playing 10-second tile preview with another
source. Tile previews remain gallery assets, not a viewer quality tier. GIFs
use `motion_url` when their companion motion poster exists.

Five persistent player slots cover the active work and the four navigation
directions. Parked videos use `preload="none"`. Only one likely next work is
prepared after the active clip has a healthy runway and measured spare bandwidth,
or its entire remaining duration is buffered. A gesture prioritizes the approached
neighbor; its decoder stops after its first frame or one second. Committing either
axis retains that player's source and playback position. Native preload hints are
advisory, not download limits: health changes stop further speculation without
clearing sources or forcibly aborting existing requests.

Startup waits for about 1.75 seconds of contiguous buffered media at the playhead,
adapting within 1.5 to 2.5 seconds from observed buffer growth and stalls. Recovery
uses a larger 3 to 4 second runway. Targets clamp to the remaining finite duration,
and already-buffered works start without an artificial delay. `canplay` alone
cannot release the gate. After five seconds, a sustained wait automatically starts
native playback, allowing browsers that suspended preload to continue fetching.
That attempt stays active until a frame arrives instead of being paused again by
initial `waiting` events. Explicit pause cancels deferred playback, and seeking
or changing works invalidates stale callbacks. Short native loops remain uninterrupted.

The poster stays above undecoded video until a presented frame is available.
Startup loading uses the canonical turning SVG mark over its own darkening scrim
and no accent glow; rebuffering keeps the last decoded frame and uses a smaller
mark. Below the mark a single `Loading` label carries an ellipsis that breathes
one, two, three, two dots, and it leans with the stage media the way the transport
iconography does. The indicator offers no action: a stalled startup releases
itself after five seconds.
The indicator waits 250 ms before appearing and fades out after presentation. Its
animations use only transform and opacity. Hidden tabs suspend playback and loading
animation; returning restores only prior playback intent. Reduced motion makes the
indicator stationary and, like data saving, disables automatic playback and neighbor
warming.

Buffering cannot make a source sustainable on a connection slower than its bitrate.
These controls do not transcode media, replace a playing source, or introduce an
adaptive-streaming quality tier.

Each pane resolves its own orientation before activation. The media stage
occupies the full viewport with header, transport and numbered thumbnails
overlaid. Tapping the artwork toggles all chrome without changing stage size,
playback or sound, and the hidden preference survives navigation. Left/right
walk works; up/down walk groups and remember the last work in each group.

Playback stays inline (`playsInline`) on iPhone. Optional fullscreen targets
the dialog container, never the native video player.

Playback icon artwork follows the video's rotation inside fixed 44px touch targets.
Labels, timestamps, seek and volume controls, and navigation arrows remain upright.
Work changes mount icons at their incoming angle; user rotation uses a short
transform transition, disabled for reduced motion.

### The resolver is the integration surface

The current resolver is R2-first and falls back safely:

```ts
url = fromR2(rep.r2_key);
if (!url && !isPlaceholderStorageId(rep.storage_id)) {
  try {
    url = await ctx.storage.getUrl(rep.storage_id);
  } catch {
    // Invalid or missing storage IDs fall through to the direct URL.
  }
}
if (!url && rep.url) url = rep.url;
```

The resolver comment and implementation agree: a valid content-addressed R2 key
wins when `REPLICATION_MEDIA_BASE_URL` is configured, followed by the old
`storage_id` through native identity rows, then the stored `url`. Runtime
startup requires the media base. Section 5 preserves historical recovery
behavior, not a supported current backend switch.

### Consequences

- **A null URL deletes the page.** `lib/next/routeLoaders.replications.ts:71-88`
  returns `not-found` when `replication.url` is falsy, and
  `lib/next/publicRoutePlan.ts:231-241` omits rows without resolved URLs from
  static parameters. With `dynamicParams = false`, a row that fails to resolve
  at build time has no page. The blast radius of a bad repoint is page removal,
  not a broken video.
- **Resolved URLs are cached twice** — 900 s in
  `lib/data/publicData.effects.ts`, then ISR HTML at 3600 s.
  `revalidateTag("data-public:replications")`, whose tag is defined in
  `lib/data/publicData.cache.ts:3-10`, forces refresh.
- **CSP already permits any HTTPS media host** —
  `lib/next/cspObservationPolicy.ts:165-168`. No CSP change is needed.
- **`next/image` is not in the path.** `src/components/common/AppImage.tsx:20-22`
  treats only local paths as optimizable, so remote posters render through a
  plain `<img>`. The absent `images.remotePatterns` has never broken them.

## 2. Historical decision: Convex was the origin

This section records the superseded 2026-08-16 operating state so earlier
performance measurements remain interpretable. The owner later selected
Cloudflare R2, and the R2 migration completed on 2026-08-30. The limitations
below describe the historical origin, not current R2 delivery. Sections 2–5
and their command examples are historical evidence only; use current native
operator contracts for ordinary work and the isolated owner-approved recovery
procedure for any historical service restoration.

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

### Delivery limits

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

Historically, transcoding removed roughly 90% of the bytes and nearly all of the
startup stall, but each visitor's first view still came from Convex Storage at
full rendition size. R2 delivery replaced that operating model; these details
remain relevant only when the rollback switch is used.

### Historical requirements carried into R2 delivery

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
| thumbnail | `enchanted-echidna-791` (**then-development; now retired**) | 65 |

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

**Why this was urgent independent of every other decision:** there was no admin
credential here for either orphan deployment, and `enchanted-echidna-791` was
the development deployment at the time; it is now retired. Development
deployments were reset as a matter of routine. HTTP GET was the only way to
obtain those bytes. A reset or deletion would have made the files irrecoverable.

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
  so names that differ only by case identify one file and the second write
  destroys the first master. `detectArchiveCollisions` folds every archive path
  and **aborts the run before fetching any bytes** when two paths collide. It
  also catches exact duplicate slugs, which occur in the corpus. The production
  corpus passed this check; an injected `Tracers-Chelsea-Morgan` /
  `tracers-chelsea-morgan` pair is detected and fatal.
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

For the 2026-08-10 video run, this step fixed size and faststart while retiring
both orphan sources and the thumbnails on now-retired development deployment
`enchanted-echidna-791`. For the 2026-08-11 image run, it performed the rescue
without transcoding. After both runs, every served byte came from production.

### Trap 1 — writing `url` is a silent no-op on 60 rows

Because `storage_id` outranks `url`, the obvious move — set `url` to the new
location, since `url` is what currently points at the orphan hosts — works for
the 65 placeholder rows and **does nothing at all** for the 60 rows that hold a
live `storage_id`. Those rows keep resolving through storage and keep serving the
old file. A migration that did this and reported success would leave 60 videos
untranscoded with no error anywhere.

The script writes **`storage_id`**, the field that wins, through
`api.replications.updateStorageIds` (`convex/replications.ts:106-109`, implemented
by `convex/lib/replicationWrites.ts:292-305`). The tested
`fieldThatWins()` function is at
`scripts/replications/repoint-renditions.mjs:107-109`; a precedence change makes
that test fail and forces the migration to be reconsidered.

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

Before each write, the script also does a **compare-and-swap check**: it re-reads
the row and aborts if `storage_id` changed after the reviewed plan. This remains
script-level because `updateStorageIds` has no `expectedStorageId` argument.
`applySourceRecoveryHandler` shows the atomic server-side pattern at
`convex/lib/replicationRecovery.ts:67-87`; adding the same precondition remains
an open decision before another large run.

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

## 6. Rerun sequence

Run repository commands from the DoseWiki repository root.

1. Attach `/Volumes/DeepSeek`. Dry-run `archive-replication-masters.mjs` (add
   `--media-type=image` for the image half); review the host breakdown, the
   collision check, and the volume budget.
2. Run it with `--write --confirm-archive`. This is the time-critical step: it is
   what removes the risk of permanently losing the bytes to a deployment reset.
3. Review the archive manifest and the corpus projection.
4. Load the production maintenance token into the operation-scoped variable,
   then run the doctor against production:

   ```bash
   export TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud
   export CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE="$(
     CONVEX_DEPLOY_KEY="$CONVEX_DEPLOY_KEY_PROD" \
       bunx convex env get CONVEX_ADMIN_KEY
   )"
   npm run convex:doctor -- --url="$TARGET_CONVEX_URL"
   ```

   Continue only when the doctor identifies `glad-minnow-656`, accepts the
   replication-maintenance credential, and reports clean function drift. Use
   this production token for the rerun only; do not mint a key or write it to a
   tracked file.
5. Dry-run `repoint-renditions.mjs` with
   `--target-url=https://glad-minnow-656.convex.cloud` and read the plan.
6. Repoint in batches with the full ceremony. Verify each batch at
   `https://dosewiki-admin.vercel.app/replications/<slug>` before continuing.
7. Call `revalidateTag("convex-public:replications")`; otherwise the 900 s
   `unstable_cache` and 3600 s ISR retain old resolved URLs. The authenticated
   editor write routes trigger it; without one, wait for both caches to expire.
8. Keep the orphan deployments for the defined rollback period.
9. Remove the operation-scoped token from the shell:

   ```bash
   unset CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE
   ```

## 7. Current schema limits

`convex/lib/effectMediaSchemaValidators.ts:119-149` defines the replication
document registered by `convex/schema.ts:263`. It has `width`, `height`,
`duration`, `file_size`, and a `format` extension string, but no MIME type,
bitrate, codec, rendition list, or master reference. A migration that records a
transcoded rendition and its archived master needs new fields; both scripts'
manifests already carry that information.

## 8. Preview renditions for gallery hover playback

Added 2026-08-15 for the /replications gallery redesign: video tiles play a
muted low-res preview instead of pulling the full rendition on hover.
(Originally the preview autoplayed while in view under a shared slot budget;
since 2026-08-25 playback is hover-gated on a fine pointer, and touch or
reduced-motion readers get fully static tiles.)

- **Field**: `preview_storage_id` is optional beside `thumbnail_storage_id` at
  `convex/lib/effectMediaSchemaValidators.ts:135-143`. It applies to video rows
  only. A row without it falls back to hover-playing the full `url`.
- **Resolver**: `convex/lib/replicationUrls.ts:43-49` resolves it to
  `preview_url` through `ctx.storage.getUrl`, with no string-field fallback.
  `convex/lib/replicationReads.ts:40-50,57-132` threads it through the public
  reads. `src/types/replications.ts:153-161` types `preview_url`, and
  `lib/public-api/v1.ts:110-135` projects it into the public API.
- **Write path**: `api.replications.updatePreviewStorageIds` is exposed at
  `convex/replications.ts:112-115` and implemented by
  `convex/lib/replicationRecovery.ts:19-54`. Its batch entries are
  `{ id, previewStorageId, expectedStorageId }`; the handler compares the row's
  current `storage_id`, rejects placeholder or malformed IDs, and leaves
  `storage_id`, `url`, and thumbnail fields unchanged.
- **Script**: `scripts/replications/generate-preview-renditions.mjs`. Dry-run
  is the default. Writes require
  `--write --confirm-write=generate-preview-renditions
  --expected-deployment=glad-minnow-656
  --target-url=https://glad-minnow-656.convex.cloud`. Per row it downloads the
  production rendition to scratch, encodes and uploads the preview, CAS-writes
  `preview_storage_id`, flushes a ledger entry, then re-queries
  `getPublicReplications`. It stops unless `preview_url` is non-null on
  `glad-minnow-656.convex.cloud` and `url`/`thumbnail_url` are unchanged.
- **Encode spec** (the gallery tile is written against exactly this): first 10s
  max · long edge 480px, never upscaled · H.264 High, yuv420p · CRF 30, preset
  veryfast · fps capped at 30 · no audio (`-an`) · `-movflags +faststart`.

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
