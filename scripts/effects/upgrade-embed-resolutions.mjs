#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";

const operation = "upgrade-embed-resolutions";
const command = createProductionWriteCommand({ operation });
if (!command.targetUrl) throw new Error("Pass an explicit --target for dry runs and writes.");
printProductionWriteCommand(command);

const args = process.argv.slice(2);
const reportDir = getFlagValue(args, "--report-dir") ??
  join(command.repoRoot, "tmp");
const deployment = command.deploymentFingerprint;

const MIN_GAIN = 1.5;
const MAX_RMSE = 0.1;
const MAX_ASPECT_DELTA = 0.05;
const LOW_RES_LONG_EDGE = 400;

const mediaFields = [
  "description_raw", "description_ast", "long_summary_raw", "long_summary_ast",
  "analysis_raw", "analysis_ast", "style_variations_raw", "style_variations_ast",
  "personal_commentary_raw", "personal_commentary_ast",
];

const storageUrlPattern = /^https:\/\/[a-z0-9-]+\.data\.cloud\/api\/storage\/[0-9a-f-]+$/i;
const captionedImagePattern = /\[captioned-image\b([^\]]*?)\/\]/g;
const attributePattern = /([a-z-]+)="([^"]*)"/g;

function normalizeName(value) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function collectEmbeds(value, out = []) {
  if (typeof value === "string") {
    for (const match of value.matchAll(captionedImagePattern)) {
      const properties = Object.fromEntries(
        [...match[1].matchAll(attributePattern)].map(([, name, attr]) => [name, attr]),
      );
      if (properties.src) out.push(properties);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEmbeds(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    if (value.name === "captioned-image" && typeof value.properties?.src === "string") {
      out.push(value.properties);
    } else {
      for (const item of Object.values(value)) collectEmbeds(item, out);
    }
  }
  return out;
}

function containsUrl(value, url) {
  if (typeof value === "string") return value.includes(url);
  if (Array.isArray(value)) return value.some((item) => containsUrl(item, url));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsUrl(item, url));
  }
  return false;
}

function replaceUrl(value, from, to) {
  if (typeof value === "string") return value.replaceAll(from, to);
  if (Array.isArray(value)) return value.map((item) => replaceUrl(item, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceUrl(item, from, to)]),
    );
  }
  return value;
}

const probeCache = new Map();
async function probeImage(url) {
  if (probeCache.has(url)) return probeCache.get(url);
  const probe = await (async () => {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      return { ok: false, error: `fetch failed: ${error.message}` };
    }
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const buffer = Buffer.from(await response.arrayBuffer());
    try {
      const image = sharp(buffer);
      const { width, height } = await image.metadata();
      if (!width || !height) return { ok: false, error: "no dimensions in metadata" };
      const fingerprint = await image
        .clone()
        .resize(32, 32, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer();
      return { ok: true, width, height, fingerprint };
    } catch (error) {
      return { ok: false, error: `decode failed: ${error.message}` };
    }
  })();
  probeCache.set(url, probe);
  return probe;
}

function rmse(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = (a[i] - b[i]) / 255;
    sum += delta * delta;
  }
  return Math.sqrt(sum / a.length);
}

const curationPath = getFlagValue(args, "--curation");
const curation = curationPath
  ? JSON.parse(readFileSync(curationPath, "utf8"))
  : { assets: [] };

const client = createDataClient({ target: command.targetUrl }).client;
const effects = await client.query(api.subjectiveEffects.getAll, {});
const replications = await client.query(api.replications.getAll, {});
const imageReplications = replications.filter((row) => row.type === "image");
const galleryRows = await client.query(api.replications.getPublicReplications, {});
const urlBySlug = new Map(
  galleryRows.flatMap((row) => (row.url ? [[row.slug, row.url]] : [])),
);
const legacy = imageReplications.filter((row) =>
  !urlBySlug.has(row.slug)
  && typeof row.storage_id === "string"
  && !row.storage_id.startsWith("placeholder"));
const servedUrls = await client.query(api.replications.resolveStorageUrls, {
  storageIds: legacy.map((row) => row.storage_id),
});
legacy.forEach((row, index) => {
  if (servedUrls[index]) urlBySlug.set(row.slug, servedUrls[index]);
});
const replicationUrl = new Map(imageReplications.map((row) => [
  row.slug,
  urlBySlug.get(row.slug) ?? row.url ?? null,
]));
const servedUrlSet = new Set([...replicationUrl.values()].filter(Boolean));

const embeds = new Map();
for (const effect of effects) {
  for (const field of mediaFields) {
    if (effect[field] === undefined || effect[field] === null) continue;
    for (const properties of collectEmbeds(effect[field])) {
      if (!storageUrlPattern.test(properties.src)) continue;
      const key = `${effect.slug}\u0000${properties.src}`;
      const entry = embeds.get(key) ?? {
        article: effect.slug,
        src: properties.src,
        title: properties.title ?? null,
        artist: properties.artist ?? null,
        fields: new Set(),
      };
      entry.fields.add(field);
      entry.title ??= properties.title ?? null;
      entry.artist ??= properties.artist ?? null;
      embeds.set(key, entry);
    }
  }
}

console.log(`Articles scanned: ${effects.length}`);
console.log(`Storage-URL embeds (article × src): ${embeds.size}`);

const curationBySignature = new Map();
for (const asset of curation.assets) {
  if (asset.confidence !== "strong") continue;
  const effectSlug = asset.source_article?.startsWith("subjectiveEffect:")
    ? asset.source_article.slice("subjectiveEffect:".length)
    : null;
  if (!effectSlug) continue;
  const signature =
    `${effectSlug}\u0000${normalizeName(asset.title)}\u0000${normalizeName(asset.artist_name)}`;
  curationBySignature.set(signature, asset);
}

const autoSwaps = [];
const ambiguous = [];
const flaggedImages = [];
let aligned = 0;
let healthy = 0;

function flag(embed, probe, extra) {
  const existing = flaggedImages.find((item) => {
    if (item.srcs.includes(embed.src)) return true;
    if (!probe?.ok || !item.fingerprint) return false;
    return item.width === probe.width && item.height === probe.height &&
      rmse(item.fingerprint, probe.fingerprint) <= MAX_RMSE;
  });
  if (existing) {
    if (!existing.articles.includes(embed.article)) existing.articles.push(embed.article);
    if (!existing.srcs.includes(embed.src)) existing.srcs.push(embed.src);
    return;
  }
  flaggedImages.push({
    articles: [embed.article],
    srcs: [embed.src],
    title: embed.title,
    artist: embed.artist,
    fingerprint: probe?.ok ? probe.fingerprint : null,
    width: probe?.ok ? probe.width : null,
    height: probe?.ok ? probe.height : null,
    ...extra,
  });
}

for (const embed of [...embeds.values()]) {
  const describe = (extra) => ({
    article: embed.article,
    src: embed.src,
    title: embed.title,
    artist: embed.artist,
    fields: [...embed.fields].sort(),
    ...extra,
  });

  if (servedUrlSet.has(embed.src)) {
    aligned += 1;
    continue;
  }

  const probe = await probeImage(embed.src);
  if (!probe.ok) {
    flag(embed, probe, { reason: `embed unreachable (${probe.error})` });
    continue;
  }
  const dimensions = `${probe.width}×${probe.height}`;
  if (Math.max(probe.width, probe.height) >= LOW_RES_LONG_EDGE) {
    healthy += 1;
    continue;
  }

  const titleKey = normalizeName(embed.title);
  const artistKey = normalizeName(embed.artist);
  const candidates = titleKey && artistKey
    ? imageReplications.filter((row) =>
        normalizeName(row.title) === titleKey && normalizeName(row.artist) === artistKey)
    : [];

  if (candidates.length === 0) {
    flag(embed, probe, {
      dimensions,
      reason: "low-res embed with no on-site replication counterpart (needs external re-sourcing)",
    });
    continue;
  }
  if (candidates.length > 1) {
    ambiguous.push(describe({
      dimensions,
      reason: `title+artist matched ${candidates.length} replications`,
      candidates: candidates.map((row) => row.slug),
    }));
    continue;
  }

  const [replication] = candidates;
  const masterUrl = replicationUrl.get(replication.slug);
  if (!masterUrl) {
    ambiguous.push(describe({
      dimensions,
      reason: `replication ${replication.slug} has no resolvable storage URL`,
    }));
    continue;
  }
  const master = await probeImage(masterUrl);
  if (!master.ok) {
    ambiguous.push(describe({
      dimensions,
      reason: `replication ${replication.slug} master unreachable (${master.error})`,
    }));
    continue;
  }

  const gainW = master.width / probe.width;
  const gainH = master.height / probe.height;
  if (gainW < MIN_GAIN || gainH < MIN_GAIN) {
    flag(embed, probe, {
      dimensions,
      reason: `low-res embed; on-site counterpart ${replication.slug} ` +
        `(${master.width}×${master.height}) is below the ${MIN_GAIN}× gain bar`,
    });
    continue;
  }

  const aspectDelta = Math.abs(
    (probe.width / probe.height) / (master.width / master.height) - 1,
  );
  const pixelRmse = rmse(probe.fingerprint, master.fingerprint);
  const signature = `${embed.article}\u0000${titleKey}\u0000${artistKey}`;
  const attestation = curationBySignature.get(signature) ?? null;
  const pixelConfirmed =
    (pixelRmse <= MAX_RMSE && aspectDelta <= MAX_ASPECT_DELTA) || Boolean(attestation);
  if (!pixelConfirmed) {
    ambiguous.push(describe({
      dimensions,
      reason: `pixel match failed against ${replication.slug} ` +
        `(rmse ${pixelRmse.toFixed(3)}, aspect delta ${aspectDelta.toFixed(3)})`,
      candidate: replication.slug,
    }));
    continue;
  }

  autoSwaps.push(describe({
    replication: replication.slug,
    from: { url: embed.src, width: probe.width, height: probe.height },
    to: { url: masterUrl, width: master.width, height: master.height },
    gain: `${gainW.toFixed(2)}×/${gainH.toFixed(2)}×`,
    rmse: Number(pixelRmse.toFixed(4)),
    aspectDelta: Number(aspectDelta.toFixed(4)),
    curationAttestation: attestation?.id ?? null,
  }));
}

const flagged = flaggedImages.map((item) => {
  const reportItem = { ...item };
  delete reportItem.fingerprint;
  delete reportItem.width;
  delete reportItem.height;
  return reportItem;
});

const report = {
  operation,
  deployment,
  postgresTarget: command.deploymentFingerprint,
  generated_at: new Date().toISOString(),
  guards: {
    minDimensionGain: MIN_GAIN,
    maxPixelRmse: MAX_RMSE,
    maxAspectDelta: MAX_ASPECT_DELTA,
    lowResLongEdge: LOW_RES_LONG_EDGE,
  },
  counts: {
    articles: effects.length,
    storageUrlEmbeds: embeds.size,
    alreadyAligned: aligned,
    healthy,
    autoSwaps: autoSwaps.length,
    ambiguous: ambiguous.length,
    flagged: flagged.length,
  },
  prodWriteCommand:
    "node scripts/effects/upgrade-embed-resolutions.mjs " +
    "--target postgresql://<host>/<database> " +
    "--write --confirm-write=upgrade-embed-resolutions " +
    "--expected-deployment=<host>/<database>",
  autoSwaps,
  ambiguous,
  flagged,
};
mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, `${operation}-${encodeURIComponent(deployment)}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Already aligned with replication master: ${aligned}`);
console.log(`Healthy (no upgrade needed): ${healthy}`);
console.log(`AUTO-SWAP: ${autoSwaps.length}`);
for (const swap of autoSwaps) {
  console.log(
    `  ${swap.article} [${swap.fields.join(", ")}]\n` +
    `    "${(swap.title ?? "").trim()}" by ${swap.artist} → replication ${swap.replication}` +
    (swap.curationAttestation ? ` (curation ${swap.curationAttestation})` : "") + `\n` +
    `    ${swap.from.width}×${swap.from.height} → ${swap.to.width}×${swap.to.height} ` +
    `(gain ${swap.gain}, rmse ${swap.rmse})\n` +
    `    - ${swap.from.url}\n` +
    `    + ${swap.to.url}`,
  );
}
console.log(`AMBIGUOUS (review, never auto-swapped): ${ambiguous.length}`);
for (const item of ambiguous) console.log(`  ${item.article}: ${item.reason}`);
console.log(`FLAGGED (unique images; no on-site counterpart / unreachable): ${flagged.length}`);
for (const item of flagged) {
  console.log(`  ${item.articles.join(", ")} (${item.dimensions ?? "?"}): ${item.reason}`);
}
console.log(`Report: ${reportPath}`);

if (command.dryRun) {
  console.log("Writes: 0");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");

const swapsByArticle = new Map();
for (const swap of autoSwaps) {
  const list = swapsByArticle.get(swap.article) ?? [];
  list.push(swap);
  swapsByArticle.set(swap.article, list);
}

let repaired = 0;
for (const [slug, swaps] of swapsByArticle) {
  const effect = effects.find((row) => row.slug === slug);
  const changes = mediaFields.flatMap((field) => {
    if (effect[field] === undefined || effect[field] === null) return [];
    let value = effect[field];
    for (const swap of swaps) value = replaceUrl(value, swap.from.url, swap.to.url);
    return JSON.stringify(value) === JSON.stringify(effect[field])
      ? []
      : [{ field, expected: effect[field], value }];
  });
  if (changes.length === 0) continue;
  await client.mutation(api.subjectiveEffects.repairLegacyMedia, {
    apiKey: credential.token,
    slug,
    changes,
    clearSocialMediaImage: false,
  });
  repaired += 1;
  console.log(`REPAIRED ${slug} (${changes.map(({ field }) => field).join(", ")})`);
}
console.log(`Repaired articles: ${repaired}`);

let verificationFailures = 0;
for (const [slug, swaps] of swapsByArticle) {
  const effect = await client.query(api.subjectiveEffects.getBySlug, { slug });
  for (const swap of swaps) {
    const stale = mediaFields.some((field) => containsUrl(effect?.[field], swap.from.url));
    const present = mediaFields.some((field) => containsUrl(effect?.[field], swap.to.url));
    const served = await probeImage(swap.to.url);
    const dimensionsOk = served.ok &&
      served.width === swap.to.width && served.height === swap.to.height;
    if (stale || !present || !dimensionsOk) {
      verificationFailures += 1;
      console.error(
        `VERIFY FAILED ${slug}: staleUrlGone=${!stale} newUrlPresent=${present} ` +
        `servedDimensions=${served.ok ? `${served.width}×${served.height}` : served.error}`,
      );
    } else {
      console.log(
        `VERIFIED ${slug}: ${swap.to.url} serves ${served.width}×${served.height}`,
      );
    }
  }
}
if (verificationFailures > 0) {
  throw new Error(`${verificationFailures} post-write verification(s) failed.`);
}
