#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const CDN_PREFIX = "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/";
const CONCURRENCY = 24;
const MANIFESTS = [
  "src/data/substanceSocialCardManifest.generated.json",
  "src/data/pageSocialCardManifest.generated.json",
  "src/data/entitySocialCardManifest.generated.json",
];

function collectUrls(cards, urls = []) {
  for (const value of Object.values(cards)) {
    if (typeof value === "string") urls.push(value);
    else if (value && typeof value === "object") collectUrls(value, urls);
  }
  return urls;
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

const urls = [];
for (const manifestPath of MANIFESTS) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  urls.push(...collectUrls(manifest.cards));
}

const invalid = urls.filter((url) => !url.startsWith(CDN_PREFIX));
if (invalid.length > 0) {
  throw new Error(`${invalid.length} social-card manifest entries do not use ${CDN_PREFIX}`);
}

const failures = [];
await mapConcurrent(urls, async (url) => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || response.headers.get("content-type") !== "image/jpeg") {
      failures.push(`${url}: HTTP ${response.status}, ${response.headers.get("content-type")}`);
    }
  } catch (error) {
    failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
});

if (failures.length > 0) {
  throw new Error(`Social-card delivery failed for ${failures.length} URL(s):\n${failures.slice(0, 20).join("\n")}`);
}
console.log(`[social-cards:verify] ${urls.length} R2 social-card URLs delivered as image/jpeg.`);
