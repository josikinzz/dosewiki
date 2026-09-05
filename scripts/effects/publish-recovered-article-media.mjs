#!/usr/bin/env bun
/**
 * Publish recovered legacy article media to the Cloudflare R2 media bucket.
 *
 * The article-media audit of 2026-09-04 found every embed in the Effect Index
 * article bodies dead: five R2 objects removed from the retired
 * `pub-879bfd45...r2.dev` bucket and three audio files that were never in this
 * repository. The bytes came back from the owner's own PsychonautWiki mirror,
 * two of them after the migration decisions had already ruled them dead, and
 * `recovery/batch3/manifest.json` records each one with its digest and source.
 *
 * This script puts those bytes where the replication corpus already lives: the
 * same bucket, the same content-addressed key space
 * (`media/sha256/<first-two-hex>/<sha256>.<ext>`), the same immutable headers,
 * served by the same worker. It follows the social-card publisher's contract
 * (scripts/build/socialCardR2Pipeline.mjs), which this file reuses rather than
 * re-derives, with one difference: article media is not all JPEG, so the key
 * extension and content type come from each file.
 *
 * Identity is the digest, never the filename. A key that already holds bytes
 * with a different digest is an immutable collision and aborts the run.
 *
 * Uploading is all this does. Repointing the article bodies at these URLs is a
 * production Convex write and lives in its own command.
 *
 *   bun scripts/effects/publish-recovered-article-media.mjs            # plan only
 *   bun scripts/effects/publish-recovered-article-media.mjs --apply \
 *     --confirm-bucket=<bucket> --confirm-plan=<digest>
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { digestFile, digestStream, writeAtomic } from "../build/socialCardR2Pipeline.mjs";

const MANIFEST = "recovery/batch3/manifest.json";
const RESULT = "recovery/batch3/published.json";
const CDN_BASE = "https://dosewiki-media.gremblinzuwu.workers.dev";
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Extension to content type. The manifest records a content type per asset, but
 * the file's own extension decides the key, so the two must agree or the object
 * would be served as something it is not. See the `format` lesson in
 * docs/replication-media-delivery.md section 3.
 */
const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  ogg: "audio/ogg",
  mp4: "video/mp4",
};

function loadR2Config() {
  const config = {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    endpoint: process.env.CLOUDFLARE_R2_S3_ENDPOINT,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
  };
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`Missing R2 configuration: CLOUDFLARE_R2_${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  }
  return config;
}

function canonicalKey(sha256, extension) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`Invalid SHA-256: ${sha256}`);
  if (!CONTENT_TYPES[extension]) throw new Error(`Unsupported media extension: ${extension}`);
  return `media/sha256/${sha256.slice(0, 2)}/${sha256}.${extension}`;
}

/**
 * The manifest records digests in base64, matching
 * articleMediaMigrationDecisions.json; R2 keys are hex. Recomputing from the
 * file and checking both encodings agree catches a manifest edited by hand and
 * a file replaced since it was recorded.
 */
async function planObject(entry) {
  const filename = path.resolve(entry.path);
  const info = await stat(filename).catch(() => null);
  if (!info) throw new Error(`${entry.key}: missing file ${entry.path}`);

  const digest = await digestFile(filename);
  const base64 = Buffer.from(digest.sha256, "hex").toString("base64");
  if (entry.sha256 && entry.sha256 !== base64) {
    throw new Error(`${entry.key}: file digest ${base64} does not match the manifest's ${entry.sha256}`);
  }
  if (entry.bytes && entry.bytes !== digest.size) {
    throw new Error(`${entry.key}: file is ${digest.size} bytes, manifest says ${entry.bytes}`);
  }

  const extension = path.extname(filename).slice(1).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (entry.contentType && entry.contentType !== contentType) {
    throw new Error(`${entry.key}: ${extension} serves as ${contentType}, manifest says ${entry.contentType}`);
  }

  const key = canonicalKey(digest.sha256, extension);
  return {
    asset: entry.key,
    article: entry.article ?? entry.surface ?? null,
    replaces: entry.asset ?? null,
    filename,
    key,
    url: `${CDN_BASE}/${key}`,
    sha256: digest.sha256,
    sha256Base64: base64,
    size: digest.size,
    contentType,
  };
}

async function buildPlan() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const publishable = manifest.filter((entry) => typeof entry.path === "string");
  const objects = [];
  for (const entry of publishable) objects.push(await planObject(entry));

  // One asset can be recorded twice (an alternate crop kept for the owner);
  // identical digests collapse to one object, differing ones stay separate.
  const byKey = new Map(objects.map((object) => [object.key, object]));
  const digest = createHash("sha256")
    .update(JSON.stringify([...byKey.values()].map(({ key, sha256, size }) => ({ key, sha256, size }))))
    .digest("hex");

  return { objects: [...byKey.values()], planDigest: digest };
}

function requireConfirmation(argv, bucket, planDigest) {
  const has = (flag, value) => argv.includes(`--${flag}=${value}`);
  if (!argv.includes("--apply")) throw new Error("Pass --apply to write to R2.");
  if (!has("confirm-bucket", bucket)) throw new Error(`Pass --confirm-bucket=${bucket}`);
  if (!has("confirm-plan", planDigest)) throw new Error(`Pass --confirm-plan=${planDigest}`);
}

async function main(argv) {
  const { objects, planDigest } = await buildPlan();
  const totalBytes = objects.reduce((sum, object) => sum + object.size, 0);

  console.log(`[recovered-media] Plan ${planDigest}`);
  console.log(`[recovered-media] ${objects.length} objects, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB, target ${CDN_BASE}/media/sha256/`);
  for (const object of objects) {
    console.log(`  ${object.asset.padEnd(6)} ${object.contentType.padEnd(11)} ${String(object.size).padStart(9)}  ${object.key}`);
  }

  if (!argv.includes("--apply")) {
    console.log("[recovered-media] Dry run complete: no network access and no R2 writes.");
    return;
  }

  const config = loadR2Config();
  requireConfirmation(argv, config.bucket, planDigest);
  if (!globalThis.Bun?.S3Client) throw new Error("Run this with Bun: credentialed writes use Bun.S3Client.");
  const client = new Bun.S3Client(config);

  const published = [];
  for (const object of objects) {
    const remote = client.file(object.key);

    if (await remote.exists()) {
      const actual = await digestStream(remote.stream());
      if (actual.sha256 !== object.sha256 || actual.size !== object.size) {
        throw new Error(`IMMUTABLE COLLISION at ${object.key}: bucket holds ${actual.size}/${actual.sha256}`);
      }
      console.log(`[recovered-media] ${object.asset} already published, digest verified`);
      published.push({ ...object, action: "already-present" });
      continue;
    }

    await remote.write(Bun.file(object.filename), {
      type: object.contentType,
      cacheControl: CACHE_CONTROL,
      contentDisposition: "inline",
      retry: 8,
    });

    const readback = await digestStream(client.file(object.key).stream());
    if (readback.sha256 !== object.sha256 || readback.size !== object.size) {
      throw new Error(`POST-WRITE MISMATCH at ${object.key}: read back ${readback.size}/${readback.sha256}`);
    }
    console.log(`[recovered-media] ${object.asset} uploaded and verified: ${object.url}`);
    published.push({ ...object, action: "uploaded" });
  }

  await writeAtomic(
    RESULT,
    `${JSON.stringify({ planDigest, publishedAt: new Date().toISOString(), cdnBase: CDN_BASE, objects: published }, null, 2)}\n`,
  );
  console.log(`[recovered-media] Wrote ${RESULT}`);
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
