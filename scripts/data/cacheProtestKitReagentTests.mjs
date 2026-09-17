#!/usr/bin/env node

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARTICLES_PATH = path.join(ROOT_DIR, "public/SubstanceIndex.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "data/third-party/protestkit/reagentTests.json");
const PARTIAL_PATH = path.join(ROOT_DIR, "tmp/reagentTests.partial.json");
const API_BASE_URL = "https://protestkit.eu/api/v1";
const REQUEST_DELAY_MS = Number(process.env.REAGENT_TEST_REQUEST_DELAY_MS ?? 250);
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

function normalizeSlug(value) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100)
    : "";
}

function isReagentResponse(value) {
  return Boolean(
    value
      && typeof value === "object"
      && value.substance
      && typeof value.substance === "object"
      && typeof value.substance.name === "string"
      && Array.isArray(value.substance.aliases)
      && value.substance.aliases.every((alias) => typeof alias === "string")
      && Array.isArray(value.reagents),
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchSlug(slug) {
  const candidate = normalizeSlug(slug);
  if (!candidate) throw new Error(`Cannot create a ProtestKit lookup for ${slug}`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(candidate)}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "DoseWiki-Reagent-Snapshot/1.0 (+https://dose.wiki)",
        },
        signal: controller.signal,
      });

      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_ATTEMPTS) {
          await wait(500 * (2 ** (attempt - 1)));
          continue;
        }
        throw new Error(`ProtestKit returned HTTP ${response.status} for ${slug}`);
      }
      if (!response.ok) {
        throw new Error(`ProtestKit returned HTTP ${response.status} for ${slug}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(`ProtestKit returned non-JSON content for ${slug}`);
      }

      const data = await response.json();
      if (!isReagentResponse(data)) {
        throw new Error(`ProtestKit returned an invalid reagent payload for ${slug}`);
      }
      return data;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await wait(500 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`ProtestKit request retries exhausted for ${slug}`);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writePartial(cache) {
  await mkdir(path.dirname(PARTIAL_PATH), { recursive: true });
  await writeFile(PARTIAL_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

function validateSnapshot(articles, cache) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    throw new Error("Expected reagentTests.json to contain an object");
  }

  const expectedSlugs = articles.map((article) => article.slug);
  if (JSON.stringify(Object.keys(cache)) !== JSON.stringify(expectedSlugs)) {
    throw new Error("reagentTests.json keys do not exactly match SubstanceIndex slug order");
  }

  const invalid = expectedSlugs.filter((slug) => cache[slug] !== null && !isReagentResponse(cache[slug]));
  if (invalid.length > 0) throw new Error(`Invalid reagent payloads: ${invalid.join(", ")}`);

  const matched = Object.values(cache).filter(Boolean).length;
  return { total: expectedSlugs.length, matched, unmatched: expectedSlugs.length - matched };
}

async function main() {
  const articles = await readJson(ARTICLES_PATH, null);
  if (!Array.isArray(articles)) {
    throw new Error("Expected public/SubstanceIndex.json to contain an array");
  }

  if (process.argv.includes("--check")) {
    const stats = validateSnapshot(articles, await readJson(OUTPUT_PATH, null));
    console.log(`Validated ${stats.total} entries (${stats.matched} matched, ${stats.unmatched} unmatched).`);
    return;
  }

  const partial = await readJson(PARTIAL_PATH, {});
  const cache = partial && typeof partial === "object" && !Array.isArray(partial) ? partial : {};

  for (const [index, article] of articles.entries()) {
    const slug = typeof article?.slug === "string" ? article.slug.trim() : "";
    if (!slug) throw new Error(`Article ${index + 1} has no slug`);
    if (Object.hasOwn(cache, slug)) continue;

    cache[slug] = await fetchSlug(slug);
    await writePartial(cache);
    await wait(REQUEST_DELAY_MS);
    console.log(`[${index + 1}/${articles.length}] ${slug}: ${cache[slug] ? "matched" : "no match"}`);
  }

  const ordered = Object.fromEntries(articles.map((article) => [article.slug, cache[article.slug] ?? null]));
  const stats = validateSnapshot(articles, ordered);
  await writePartial(ordered);
  await rename(PARTIAL_PATH, OUTPUT_PATH);
  await rm(path.dirname(PARTIAL_PATH), { recursive: true, force: true });

  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: OUTPUT_PATH,
    rootDir: ROOT_DIR,
    command: "npm run reagents:cache",
    sourceDeployment: API_BASE_URL,
    schemaVersion: "ProtestKit API v1 response keyed by DoseWiki slug",
    extra: { ...stats, requestDelayMs: REQUEST_DELAY_MS },
  });

  console.log(`Wrote ${stats.total} entries (${stats.matched} matched, ${stats.unmatched} unmatched).`);
  if (lineage) console.log(`Lineage metadata written to ${lineage.outputPath}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(`Partial progress is retained at ${path.relative(ROOT_DIR, PARTIAL_PATH)}.`);
  process.exitCode = 1;
});
