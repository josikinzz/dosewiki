#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFiles } from "../lib/data-ops-run-context.mjs";

const OPERATION = "publish-social-cards";
const DEFAULT_CDN_BASE = "https://dosewiki-media.gremblinzuwu.workers.dev";
const CONCURRENCY = 12;
const MANIFESTS = [
  "src/data/substanceSocialCardManifest.generated.json",
  "src/data/pageSocialCardManifest.generated.json",
  "src/data/entitySocialCardManifest.generated.json",
];

function collectCardEntries(cards, entries = []) {
  for (const value of Object.values(cards)) {
    if (typeof value === "string") entries.push(value);
    else if (value && typeof value === "object") collectCardEntries(value, entries);
  }
  return entries;
}

function relativeCardPath(cardPath) {
  if (cardPath.startsWith("/images/social/")) {
    return cardPath.slice("/images/social/".length);
  }
  const url = new URL(cardPath);
  if (url.pathname.startsWith("/social-cards/")) {
    return url.pathname.slice("/social-cards/".length);
  }
  throw new Error(`Expected a social-card path, received ${cardPath}`);
}

function localAssetPath(cardPath) {
  return path.join(process.cwd(), "public/images/social", relativeCardPath(cardPath));
}


async function mapConcurrent(items, worker) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}
async function digestFile(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}


async function loadPlan() {
  const manifests = [];
  const objects = [];
  const remoteUrlByCardPath = new Map();
  const seenKeys = new Set();
  for (const manifestPath of MANIFESTS) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const paths = collectCardEntries(manifest.cards);
    for (const cardPath of paths) {
      const filename = localAssetPath(cardPath);
      const digest = await digestFile(filename);
      const key = `media/sha256/${digest.slice(0, 2)}/${digest}.jpg`;
      remoteUrlByCardPath.set(cardPath, key);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const metadata = await stat(filename);
      objects.push({ filename, key, size: metadata.size });
    }
    manifests.push({ manifestPath, manifest });
  }
  return { manifests, objects, remoteUrlByCardPath };
}

function remoteManifest(manifest, cdnBase, remoteUrlByCardPath) {
  const rewrite = (value) => {
    if (typeof value === "string") {
      const key = remoteUrlByCardPath.get(value);
      if (!key) throw new Error(`Missing R2 key for ${value}`);
      return `${cdnBase}/${key}`;
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
  };
  return { ...manifest, cards: rewrite(manifest.cards) };
}

async function writeAtomic(filename, content) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, filename);
}

async function main() {
  loadEnvFiles({ rootDir: process.cwd(), env: process.env });
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const confirmed = args.has(`--confirm-write=${OPERATION}`);
  const cdnBase = (process.env.SOCIAL_CARD_CDN_BASE ?? DEFAULT_CDN_BASE).replace(/\/+$/, "");
  const { manifests, objects, remoteUrlByCardPath } = await loadPlan();
  const bytes = objects.reduce((total, object) => total + object.size, 0);
  console.log(`[social-cards:r2] Validated ${objects.length} local cards (${(bytes / 1024 / 1024).toFixed(1)} MiB).`);
  console.log(`[social-cards:r2] Target: ${cdnBase}/media/sha256/`);

  if (!write) {
    console.log(`[social-cards:r2] Dry run: no R2 writes and no manifest changes. Re-run with --write --confirm-write=${OPERATION}.`);
    return;
  }
  if (!confirmed) {
    throw new Error(`Refusing R2 writes without --confirm-write=${OPERATION}`);
  }
  if (!globalThis.Bun?.S3Client) {
    throw new Error("Run this publisher with Bun.");
  }

  const config = {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    endpoint: process.env.CLOUDFLARE_R2_S3_ENDPOINT,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
  };
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`Missing R2 configuration: ${name}`);
  }
  const s3 = new Bun.S3Client(config);
  let uploaded = 0;
  let reused = 0;
  await mapConcurrent(objects, async (object) => {
    if ((await s3.exists(object.key)) && (await s3.size(object.key)) === object.size) {
      reused += 1;
      return;
    }
    await s3.write(object.key, Bun.file(object.filename), {
      type: "image/jpeg",
      retry: 8,
    });
    if ((await s3.size(object.key)) !== object.size) {
      throw new Error(`R2 read-back size mismatch for ${object.key}`);
    }
    uploaded += 1;
    if ((uploaded + reused) % 100 === 0) {
      console.log(`[social-cards:r2] ${uploaded + reused}/${objects.length} checked (${uploaded} uploaded, ${reused} reused)`);
    }
  });

  for (const { manifestPath, manifest } of manifests) {
    await writeAtomic(manifestPath, `${JSON.stringify(remoteManifest(manifest, cdnBase, remoteUrlByCardPath), null, 2)}\n`);
  }
  console.log(`[social-cards:r2] Complete: ${uploaded} uploaded, ${reused} reused; manifests now reference R2.`);
}

await main();
