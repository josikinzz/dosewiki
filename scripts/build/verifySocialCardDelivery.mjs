#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTENT_TYPE,
  DEFAULT_CDN_BASE,
  KEY_PATTERN,
  createLedgerWriter,
  mapConcurrent,
  parseFlagValue,
  parseFlagValues,
  readJsonLines,
} from "./socialCardR2Pipeline.mjs";

const DEFAULT_MANIFEST = "src/data/entitySocialCardManifest.generated.json";
const DEFAULT_LEDGER = "runs/social-card-r2-promotion/verification-ledger.jsonl";
const DEFAULT_HOSTS = ["https://dose.wiki", "https://effectindex.com"];
const ROUTE_BY_CATEGORY = {
  replications: "replications",
  contributors: "contributors",
};

function usage() {
  return `Usage:
  node scripts/build/verifySocialCardDelivery.mjs \\
    --manifest=<candidate-or-installed-manifest.json> \\
    --ledger=<append-only-verification.jsonl> \\
    [--delivery-base=${DEFAULT_CDN_BASE}] \\
    [--host=https://dose.wiki --host=https://effectindex.com] \\
    [--concurrency=8] [--run-id=<dose-and-effect-deployment-identity>]

Default behavior is exhaustive: hash every unique object and verify every
replication and contributor page's canonical, og:image, and twitter:image on
both public hosts. Use --objects-only for the pre-deployment object-integrity
gate; exact coverage is recorded as object-verification-complete.`;
}

function collectEntries(cards, trail = [], entries = []) {
  for (const [key, child] of Object.entries(cards ?? {})) {
    const next = [...trail, key];
    if (typeof child === "string") entries.push({ category: next[0], slug: next.slice(1).join("/"), url: child });
    else if (child && typeof child === "object") collectEntries(child, next, entries);
    else throw new Error(`Invalid manifest card at ${next.join(".")}`);
  }
  return entries;
}

export function parseImmutableCardUrl(url, deliveryBase = DEFAULT_CDN_BASE) {
  const actual = new URL(url);
  const expected = new URL(deliveryBase);
  if (actual.origin !== expected.origin) throw new Error(`Unexpected social-card origin: ${url}`);
  const basePath = expected.pathname.replace(/\/+$/, "");
  if (basePath && !actual.pathname.startsWith(`${basePath}/`)) throw new Error(`Unexpected social-card base path: ${url}`);
  const key = actual.pathname.slice(basePath.length).replace(/^\//, "");
  const match = KEY_PATTERN.exec(key);
  if (!match || !match[2].startsWith(match[1])) throw new Error(`Non-canonical immutable social-card URL: ${url}`);
  return { url: actual.toString(), key, sha256: match[2] };
}

export function buildVerificationPlan(manifest, deliveryBase = DEFAULT_CDN_BASE, hosts = DEFAULT_HOSTS) {
  const planDigest = manifest.promotion?.planDigest;
  if (!/^[0-9a-f]{64}$/.test(planDigest ?? "")) throw new Error("Manifest lacks a valid promotion.planDigest");
  const entries = collectEntries(manifest.cards).sort((left, right) => `${left.category}\0${left.slug}`.localeCompare(`${right.category}\0${right.slug}`));
  const objectsByKey = new Map();
  for (const entry of entries) {
    const object = parseImmutableCardUrl(entry.url, deliveryBase);
    const prior = objectsByKey.get(object.key);
    if (prior && prior.sha256 !== object.sha256) throw new Error(`Manifest key collision: ${object.key}`);
    objectsByKey.set(object.key, object);
  }
  const normalizedHosts = hosts.map((host) => new URL(host).origin);
  const routes = [];
  for (const entry of entries) {
    const routeFamily = ROUTE_BY_CATEGORY[entry.category];
    if (!routeFamily) continue;
    for (const host of normalizedHosts) {
      routes.push({
        id: `${host}|${entry.category}|${entry.slug}`,
        host,
        category: entry.category,
        slug: entry.slug,
        pageUrl: `${host}/${routeFamily}/${encodeURIComponent(entry.slug)}`,
        canonicalUrl: `${host}/${routeFamily}/${encodeURIComponent(entry.slug)}`,
        expectedImageUrl: entry.url,
      });
    }
  }
  return {
    planDigest,
    entries,
    objects: [...objectsByKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    routes,
    hosts: normalizedHosts,
  };
}

export function validateDeliveryHeaders(headers, key, expectedSize) {
  const contentType = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== CONTENT_TYPE) throw new Error(`Content-Type mismatch for ${key}: ${contentType}`);
  const cacheControl = headers.get("cache-control") ?? "";
  if (!/\bpublic\b/i.test(cacheControl) || !/\bimmutable\b/i.test(cacheControl) || !/\bmax-age=31536000\b/i.test(cacheControl)) {
    throw new Error(`Immutable cache policy missing for ${key}: ${cacheControl}`);
  }
  const disposition = headers.get("content-disposition") ?? "";
  if (!/^inline(?:;|$)/i.test(disposition.trim())) throw new Error(`Inline disposition missing for ${key}: ${disposition}`);
  if (headers.get("accept-ranges") !== "bytes") throw new Error(`Byte-range delivery missing for ${key}`);
  const length = Number(headers.get("content-length"));
  if (expectedSize !== undefined && length !== expectedSize) throw new Error(`Content-Length mismatch for ${key}: ${length} != ${expectedSize}`);
  return { contentType, cacheControl, disposition, length };
}

export async function verifyObject(fetchImpl, object) {
  const separator = object.url.includes("?") ? "&" : "?";
  const bust = `${separator}social-card-integrity=${object.sha256}`;
  const [head, get] = await Promise.all([
    fetchImpl(`${object.url}${bust}`, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(30_000) }),
    fetchImpl(`${object.url}${bust}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) }),
  ]);
  if (head.status !== 200) throw new Error(`HEAD ${object.key}: HTTP ${head.status}`);
  if (get.status !== 200 && get.status !== 206) throw new Error(`GET ${object.key}: HTTP ${get.status}`);
  const bytes = Buffer.from(await get.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== object.sha256) throw new Error(`Delivered digest mismatch for ${object.key}: ${sha256}`);
  validateDeliveryHeaders(head.headers, object.key, bytes.length);
  validateDeliveryHeaders(get.headers, object.key, bytes.length);
  const contentRange = get.headers.get("content-range");
  if (get.status === 200 && contentRange !== null) {
    throw new Error(`Unexpected Content-Range on HTTP 200 for ${object.key}: ${contentRange}`);
  }
  if (get.status === 206) {
    const expectedRange = `bytes 0-${bytes.length - 1}/${bytes.length}`;
    if (contentRange !== expectedRange) {
      throw new Error(`Incomplete HTTP 206 response for ${object.key}: ${contentRange} != ${expectedRange}`);
    }
  }
  return { sha256, size: bytes.length };
}

function parseAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    attributes[match[1].toLowerCase()] = match[3];
  }
  return attributes;
}

export function extractPageMetadata(html) {
  let ogImage;
  let twitterImage;
  let canonical;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    if (attributes.property?.toLowerCase() === "og:image") ogImage = attributes.content;
    if (attributes.name?.toLowerCase() === "twitter:image") twitterImage = attributes.content;
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    if (attributes.rel?.toLowerCase().split(/\s+/).includes("canonical")) canonical = attributes.href;
  }
  return { ogImage, twitterImage, canonical };
}

export async function verifyRoute(fetchImpl, route) {
  const separator = route.pageUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${route.pageUrl}${separator}social-card-verify=1`, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status !== 200) throw new Error(`${route.pageUrl}: HTTP ${response.status}`);
  const metadata = extractPageMetadata(await response.text());
  if (metadata.canonical !== route.canonicalUrl) throw new Error(`${route.pageUrl}: canonical ${metadata.canonical} != ${route.canonicalUrl}`);
  if (metadata.ogImage !== route.expectedImageUrl) throw new Error(`${route.pageUrl}: og:image ${metadata.ogImage} != ${route.expectedImageUrl}`);
  if (metadata.twitterImage !== route.expectedImageUrl) throw new Error(`${route.pageUrl}: twitter:image ${metadata.twitterImage} != ${route.expectedImageUrl}`);
  return metadata;
}

export async function runVerification({ plan, ledgerPath, fetchImpl = fetch, concurrency = 8, objectsOnly = false, runId }) {
  if (!objectsOnly && !runId) throw new Error("Exhaustive served-tag verification requires --run-id tied to the two deployment identities");
  const effectiveRunId = runId ?? `objects-only:${plan.planDigest}`;
  const records = await readJsonLines(ledgerPath);
  const append = createLedgerWriter(ledgerPath);
  const expectedObjects = new Map(plan.objects.map((object) => [object.key, object]));
  const verifiedObjects = new Map();
  for (const record of records) {
    if (record.type !== "object-verified" || record.planDigest !== plan.planDigest || record.runId !== effectiveRunId) continue;
    const expected = expectedObjects.get(record.key);
    if (expected && record.sha256 === expected.sha256 && Number.isSafeInteger(record.size) && record.size >= 0) {
      verifiedObjects.set(record.key, record);
    }
  }
  const verifiedRoutes = new Set(records.filter((record) => record.type === "route-verified" && record.planDigest === plan.planDigest && record.runId === effectiveRunId).map((record) => record.id));
  const pendingObjects = plan.objects.filter((object) => !verifiedObjects.has(object.key));
  await append({ type: "verification-start", planDigest: plan.planDigest, runId: effectiveRunId, objectCount: plan.objects.length, routeCount: objectsOnly ? 0 : plan.routes.length, hosts: plan.hosts });
  await mapConcurrent(pendingObjects, concurrency, async (object) => {
    const result = await verifyObject(fetchImpl, object);
    await append({ type: "object-verified", planDigest: plan.planDigest, runId: effectiveRunId, key: object.key, ...result });
    verifiedObjects.set(object.key, { ...object, ...result });
  });
  if (verifiedObjects.size !== plan.objects.length) {
    throw new Error(`Object verification coverage incomplete: ${verifiedObjects.size} != ${plan.objects.length}`);
  }
  const verifiedBytes = [...verifiedObjects.values()].reduce((total, object) => total + object.size, 0);
  const priorObjectComplete = records.some((record) => (
    record.type === "object-verification-complete"
    && record.planDigest === plan.planDigest
    && record.runId === effectiveRunId
    && record.objectCount === plan.objects.length
    && record.totalBytes === verifiedBytes
    && record.exhaustive === true
  ));
  if (!priorObjectComplete) {
    await append({
      type: "object-verification-complete",
      planDigest: plan.planDigest,
      runId: effectiveRunId,
      objectCount: plan.objects.length,
      totalBytes: verifiedBytes,
      exhaustive: true,
    });
  }
  if (!objectsOnly) {
    const pendingRoutes = plan.routes.filter((route) => !verifiedRoutes.has(route.id));
    await mapConcurrent(pendingRoutes, concurrency, async (route) => {
      const metadata = await verifyRoute(fetchImpl, route);
      await append({ type: "route-verified", planDigest: plan.planDigest, runId: effectiveRunId, id: route.id, category: route.category, slug: route.slug, host: route.host, metadata });
    });
    await append({
      type: "verification-complete",
      planDigest: plan.planDigest,
      runId: effectiveRunId,
      objectCount: plan.objects.length,
      routeCount: plan.routes.length,
      hosts: plan.hosts,
      exhaustive: true,
    });
  }
  return {
    objectsVerified: plan.objects.length,
    routesVerified: objectsOnly ? 0 : plan.routes.length,
    resumedObjects: plan.objects.length - pendingObjects.length,
    resumedRoutes: objectsOnly ? 0 : plan.routes.length - plan.routes.filter((route) => !verifiedRoutes.has(route.id)).length,
  };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    console.log(usage());
    return;
  }
  const manifestPath = path.resolve(parseFlagValue(argv, "--manifest", DEFAULT_MANIFEST));
  const ledgerPath = path.resolve(parseFlagValue(argv, "--ledger", DEFAULT_LEDGER));
  const deliveryBase = parseFlagValue(argv, "--delivery-base", DEFAULT_CDN_BASE);
  const hosts = parseFlagValues(argv, "--host");
  const concurrency = Number(parseFlagValue(argv, "--concurrency", "8"));
  const runId = parseFlagValue(argv, "--run-id");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const plan = buildVerificationPlan(manifest, deliveryBase, hosts.length ? hosts : DEFAULT_HOSTS);
  console.log(`[social-cards:verify] Plan ${plan.planDigest}: ${plan.objects.length} unique objects, ${plan.routes.length} served pages.`);
  const summary = await runVerification({ plan, ledgerPath, concurrency, objectsOnly: argv.includes("--objects-only"), runId });
  console.log(`[social-cards:verify] Verified ${summary.objectsVerified} objects and ${summary.routesVerified} served pages; append-only ledger ${ledgerPath}.`);
  return summary;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    console.error(usage());
    process.exit(1);
  });
}
