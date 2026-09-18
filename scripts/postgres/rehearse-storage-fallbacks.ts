/**
 * Rehearsal: prove on Postgres that `ctx.storage.getUrl` serves the
 * `storageObjects` mapping and that every storage-id fallback behaves exactly
 * as specified when the mapping is absent (null, never a throw).
 *
 *   bun scripts/postgres/rehearse-storage-fallbacks.ts [--target <url>] [--allow-remote] [--keep]
 *
 * Creates scratch rows prefixed `t11-<random>` (one replication, two
 * contributor profiles, one avatar history row, storageObjects rows) and
 * deletes them unless `--keep`. Every read goes through `PostgresClient`
 * with the same `api.*` references the app uses; handlers are unchanged.
 *
 * Scenarios:
 *   1. absent:   no mapping. `replications.getBySlug` falls back to the row's
 *                direct `url`/`thumbnail_url`; preview/motion/poster are null;
 *                `replications.resolveStorageUrls` yields nulls; profile avatar
 *                falls back to `avatarUrl` or null; identity avatar is null.
 *                The resolved row equals the unmapped-media shape, so the src
 *                poster/motion ladders (`qualityLadder.ts`) pick the same frame.
 *   2. mapped:   storageObjects rows exist. Each mapped id resolves to its
 *                mapped URL; unmapped siblings keep scenario 1 behaviour.
 *   3. sharing:  thumbnail_storage_id === storage_id reuses the mapped URL.
 *   4. placeholder: `placeholder-*` ids are never looked up.
 *   5. precedence: a canonical R2 key with REPLICATION_MEDIA_BASE_URL set wins
 *                over a historical storage identity mapping.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { api } from "../../lib/postgres/runtime/api";
import { deleteDocument, insertDocument, mintDocumentId, patchDocument, withTransaction } from "../../lib/postgres/documentStore";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { slideMotionSource, slidePosterSource } from "../../src/features/replications/viewer/qualityLadder";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

type Resolved = { url: string | null; thumbnail_url: string | null; preview_url: string | null; motion_url: string | null; motion_poster_url: string | null };
function resolvedOf(row: Record<string, unknown> | null): Resolved | null {
  if (!row) return null;
  const pick = (key: string) => (row[key] as string | undefined) ?? null;
  return { url: pick("url"), thumbnail_url: pick("thumbnail_url"), preview_url: pick("preview_url"), motion_url: pick("motion_url"), motion_poster_url: pick("motion_poster_url") };
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const keep = argv.includes("--keep");
  const prefix = `t11-${mintDocumentId().slice(0, 8)}`;
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-storage-fallbacks`);
  const started = performance.now();
  const pool = new Pool({ connectionString: target, max: 2 });
  const client = new PostgresClient(pool);
  const scratch: Array<{ table: "replications" | "contributorProfiles" | "contributorAvatarHistory"; id: string }> = [];
  const storageIds = {
    main: `${prefix}-main`,
    thumb: `${prefix}-thumb`,
    preview: `${prefix}-preview`,
    motion: `${prefix}-motion`,
    poster: `${prefix}-poster`,
    avatar: `${prefix}-avatar`,
    historyAvatar: `${prefix}-history-avatar`,
  };
  const mapped = (id: string) => `https://r2.invalid/imported-storage/${id}`;
  const previousBase = process.env.REPLICATION_MEDIA_BASE_URL;
  delete process.env.REPLICATION_MEDIA_BASE_URL;

  try {
    const slug = `${prefix}-work`;
    const directUrl = `https://fallback.invalid/${prefix}/main.mp4`;
    const directThumb = `https://fallback.invalid/${prefix}/thumb.webp`;
    const replicationId = await insertDocument(pool, "replications", {
      slug,
      title: `Rehearsal ${prefix}`,
      artist: prefix,
      type: "video",
      format: "mp4",
      created_at: new Date().toISOString(),
      storage_id: storageIds.main,
      thumbnail_storage_id: storageIds.thumb,
      preview_storage_id: storageIds.preview,
      motion_storage_id: storageIds.motion,
      motion_poster_storage_id: storageIds.poster,
      url: directUrl,
      thumbnail_url: directThumb,
    });
    scratch.push({ table: "replications", id: replicationId });
    const now = new Date().toISOString();
    const profileKey = `${prefix}-PROFILE`.toUpperCase();
    const bareKey = `${prefix}-BARE`.toUpperCase();
    const avatarFallback = `https://fallback.invalid/${prefix}/avatar.png`;
    const profileId = await insertDocument(pool, "contributorProfiles", {
      key: profileKey, displayName: "Rehearsal", aliases: [], bio: "", links: [], createdAt: now, updatedAt: now,
      avatarStorageId: storageIds.avatar, avatarUrl: avatarFallback,
    });
    scratch.push({ table: "contributorProfiles", id: profileId });
    const bareId = await insertDocument(pool, "contributorProfiles", {
      key: bareKey, displayName: "Rehearsal bare", aliases: [], bio: "", links: [], createdAt: now, updatedAt: now,
      avatarStorageId: `${prefix}-bare-avatar`,
    });
    scratch.push({ table: "contributorProfiles", id: bareId });
    const digest = "0".repeat(64);
    const historyId = await insertDocument(pool, "contributorAvatarHistory", {
      profile_id: profileId, provenance: "profile-controlled", storage_id: storageIds.historyAvatar, media_digest: digest,
      delivery_verification: "verified", delivery_verified_at: Date.now(),
      delivery_receipt: { url: "https://fallback.invalid/receipt", content_sha256: digest, byte_size: 1, http_status: 200, verified_at: Date.now(), verifier: prefix, receipt_digest: digest },
      evidence: [], operation_id: prefix, recorded_at: Date.now(),
    });
    scratch.push({ table: "contributorAvatarHistory", id: historyId });

    // 1. absent
    const absent = resolvedOf(await client.query(api.replications.getBySlug, { slug }));
    const unmapped: Resolved = { url: directUrl, thumbnail_url: directThumb, preview_url: null, motion_url: null, motion_poster_url: null };
    expect("absent", "getBySlug falls back to direct url/thumbnail_url and nulls the rest (unmapped-media shape)", JSON.stringify(absent) === JSON.stringify(unmapped), { absent, unmapped });
    const nulls = await client.query(api.replications.resolveStorageUrls, { storageIds: [storageIds.main, storageIds.thumb] });
    expect("absent", "resolveStorageUrls returns null per unmapped id", JSON.stringify(nulls) === "[null,null]", nulls);
    const profile = await client.query(api.contributorProfiles.getByKey, { key: profileKey });
    expect("absent", "profile avatar falls back to avatarUrl", profile?.avatarUrl === avatarFallback, profile?.avatarUrl);
    const bare = await client.query(api.contributorProfiles.getByKey, { key: bareKey });
    expect("absent", "profile without avatarUrl yields null avatar", bare !== null && bare.avatarUrl === null, bare?.avatarUrl);
    const identity = await client.query(api.publicReplicationIdentitySocial.getProfileIdentityByKey, { key: profileKey });
    expect("absent", "identity avatar_url is null for an unmapped verified avatar", identity !== null && identity.avatar_url === null, identity);
    if (absent) {
      const video = { type: "video" as const, format: "mp4", ...absent };
      expect("absent", "src poster ladder picks the direct thumbnail for a video", slidePosterSource(video) === directThumb && slidePosterSource(video) === slidePosterSource({ ...video, ...unmapped }));
      expect("absent", "src motion ladder plays the direct url for a video", slideMotionSource(video) === directUrl);
      const gif = { type: "image" as const, format: "gif", ...absent };
      expect("absent", "src ladders give a GIF no poster and no motion when the renditions are unmapped", slidePosterSource(gif) === null && slideMotionSource(gif) === null);
    }

    // 2. mapped
    for (const id of [storageIds.main, storageIds.preview, storageIds.poster, storageIds.avatar, storageIds.historyAvatar]) {
      await pool.query('INSERT INTO "storageObjects" ("storage_id", "url", "r2_key") VALUES ($1, $2, $3)', [id, mapped(id), `imported-storage/${id}`]);
    }
    const partial = resolvedOf(await client.query(api.replications.getBySlug, { slug }));
    const expectedPartial: Resolved = { url: mapped(storageIds.main), thumbnail_url: directThumb, preview_url: mapped(storageIds.preview), motion_url: null, motion_poster_url: mapped(storageIds.poster) };
    expect("mapped", "getBySlug serves mapped urls and keeps fallbacks for unmapped siblings", JSON.stringify(partial) === JSON.stringify(expectedPartial), { partial, expectedPartial });
    const mixed = await client.query(api.replications.resolveStorageUrls, { storageIds: [storageIds.main, storageIds.thumb] });
    expect("mapped", "resolveStorageUrls maps per id", JSON.stringify(mixed) === JSON.stringify([mapped(storageIds.main), null]), mixed);
    const mappedProfile = await client.query(api.contributorProfiles.getByKey, { key: profileKey });
    expect("mapped", "profile avatar resolves through the mapping", mappedProfile?.avatarUrl === mapped(storageIds.avatar), mappedProfile?.avatarUrl);
    const mappedIdentity = await client.query(api.publicReplicationIdentitySocial.getProfileIdentityByKey, { key: profileKey });
    expect("mapped", "identity avatar_url resolves through the mapping", mappedIdentity?.avatar_url === mapped(storageIds.historyAvatar), mappedIdentity);
    if (partial) {
      const gif = { type: "image" as const, format: "gif", ...partial };
      expect("mapped", "src GIF poster uses the mapped motion poster; motion stays off without a motion rendition", slidePosterSource(gif) === mapped(storageIds.poster) && slideMotionSource(gif) === null);
    }

    // 3. sharing
    await patchDocument(pool, "replications", replicationId, { thumbnail_storage_id: storageIds.main });
    const shared = resolvedOf(await client.query(api.replications.getBySlug, { slug }));
    expect("sharing", "thumbnail sharing the main id reuses the mapped url", shared?.thumbnail_url === mapped(storageIds.main), shared);

    // 4. placeholder
    await patchDocument(pool, "replications", replicationId, { storage_id: "placeholder-t11", thumbnail_storage_id: storageIds.thumb });
    const placeholder = resolvedOf(await client.query(api.replications.getBySlug, { slug }));
    expect("placeholder", "placeholder id is skipped and the direct url wins", placeholder?.url === directUrl, placeholder);
    await patchDocument(pool, "replications", replicationId, { storage_id: storageIds.main });

    // 5. precedence
    const r2Key = `media/sha256/ab/${"ab".repeat(32)}.mp4`;
    await patchDocument(pool, "replications", replicationId, { r2_key: r2Key });
    process.env.REPLICATION_MEDIA_BASE_URL = "https://media.invalid";
    const viaR2 = resolvedOf(await client.query(api.replications.getBySlug, { slug }));
    expect("precedence", "canonical R2 key beats the storage mapping when the base url is set", viaR2?.url === `https://media.invalid/${r2Key}` && viaR2.preview_url === mapped(storageIds.preview), viaR2);
    delete process.env.REPLICATION_MEDIA_BASE_URL;
    const withoutBase = resolvedOf(await client.query(api.replications.getBySlug, { slug }));
    expect("precedence", "unset base url ignores the R2 key and returns to the mapping (rollback switch)", withoutBase?.url === mapped(storageIds.main), withoutBase);
  } finally {
    if (previousBase === undefined) delete process.env.REPLICATION_MEDIA_BASE_URL;
    else process.env.REPLICATION_MEDIA_BASE_URL = previousBase;
    if (!keep) {
      await withTransaction(pool, async (tx) => {
        for (const row of scratch.reverse()) await deleteDocument(tx, row.table, row.id);
        await tx.query('DELETE FROM "storageObjects" WHERE "storage_id" LIKE $1', [`${prefix}-%`]);
      });
    }
    const passed = checks.filter((c) => c.pass).length;
    const summary = { target: target.replace(/\/\/[^@]*@/, "//<redacted>@"), prefix, kept: keep, elapsedMs: Math.round(performance.now() - started), passed, failed: checks.length - passed, checks };
    fs.mkdirSync(runDirectory, { recursive: true });
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nReport: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(JSON.stringify({ passed, failed: summary.failed, elapsedMs: summary.elapsedMs }));
    process.exitCode = summary.failed === 0 ? 0 : 1;
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
