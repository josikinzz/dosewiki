#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  collectLegacyArticleMediaKeys,
  isLegacyArticleMediaUrl,
  legacyArticleMediaKey,
  replaceLegacyArticleMedia,
} from "./lib/legacy-article-media.mjs";

const operation = "repair-legacy-article-media";
const command = createProductionWriteCommand({ operation });
if (!command.targetUrl) throw new Error("Pass an explicit --target-url for dry runs and writes.");
printProductionWriteCommand(command);

const recoveryDir = getFlagValue(process.argv.slice(2), "--recovery-dir");
if (!recoveryDir) throw new Error("Pass --recovery-dir containing a verified manifest.json.");
const recoveryManifest = JSON.parse(readFileSync(join(recoveryDir, "manifest.json"), "utf8"));
const recoveredMedia = new Map(recoveryManifest.map((item) => [item.key, item]));

const mediaFields = [
  "description_raw", "description_ast", "long_summary_raw", "long_summary_ast",
  "analysis_raw", "analysis_ast", "style_variations_raw", "style_variations_ast",
  "personal_commentary_raw", "personal_commentary_ast",
];
function collectKnownUrls(value, staleUrlToKey, keys) {
  if (typeof value === "string") {
    for (const [url, key] of staleUrlToKey) if (value.includes(url)) keys.add(key);
  } else if (Array.isArray(value)) {
    for (const item of value) collectKnownUrls(item, staleUrlToKey, keys);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectKnownUrls(item, staleUrlToKey, keys);
  }
}

function mediaKeysForEffect(effect, staleUrlToKey) {
  const keys = collectLegacyArticleMediaKeys(effect);
  collectKnownUrls(effect, staleUrlToKey, keys);
  return keys;
}

function replaceKnownUrls(value, knownReplacements) {
  if (typeof value === "string") {
    let result = value;
    for (const [from, to] of knownReplacements) result = result.replaceAll(from, to);
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => replaceKnownUrls(item, knownReplacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceKnownUrls(item, knownReplacements)]),
    );
  }
  return value;
}

function mediaForKey(key) {
  const item = recoveredMedia.get(key);
  if (!item) return null;
  return { ...item, body: readFileSync(join(recoveryDir, item.file)) };
}

const client = new ConvexHttpClient(command.targetUrl);
const uploadStatePath = join(
  recoveryDir,
  `uploads-${new URL(command.targetUrl).hostname.split(".")[0]}.json`,
);
const uploadState = existsSync(uploadStatePath)
  ? JSON.parse(readFileSync(uploadStatePath, "utf8"))
  : {};
const storageIds = new Map(
  Object.entries(uploadState).map(([key, value]) => [key, value.split("/").at(-1)]),
);
const staleUrlToKey = new Map(
  [...storageIds].map(([key, storageId]) => [
    `${command.targetUrl}/api/storage/${storageId}`,
    key,
  ]),
);
const effects = await client.query(api.subjectiveEffects.getAll, {});
const affected = effects.map((effect) => ({
  effect,
  keys: mediaKeysForEffect(effect, staleUrlToKey),
}))
  .filter(({ keys }) => keys.size > 0);
const allKeys = new Set(affected.flatMap(({ keys }) => [...keys]));
const recoverable = [...allKeys].filter((key) => recoveredMedia.has(key)).sort();
const unavailable = [...allKeys].filter((key) => !recoveredMedia.has(key)).sort();

for (const key of recoverable) mediaForKey(key);
console.log(`Affected effects: ${affected.length}`);
console.log(`Legacy media keys: ${allKeys.size}`);
console.log(`Recovered and decode-verified: ${recoverable.length}`);
console.log(`Unavailable broken media to remove: ${unavailable.length}`);

if (command.dryRun) {
  console.log("Uploads: 0");
  console.log("Writes: 0");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");
for (const key of recoverable) {
  if (storageIds.has(key)) continue;
  const { body, contentType } = mediaForKey(key);
  const uploadUrl = await client.mutation(api.replications.generateUploadUrl, {
    apiKey: credential.token,
  });
  const upload = spawnSync(
    "curl",
    ["--fail-with-body", "--silent", "--show-error", "--request", "POST",
      "--header", `Content-Type: ${contentType}`, "--data-binary", "@-", uploadUrl],
    { input: body, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (upload.status !== 0) {
    throw new Error(`Convex upload failed for ${key}: ${upload.stderr.trim()}`);
  }
  const { storageId } = JSON.parse(upload.stdout);
  storageIds.set(key, storageId);
  writeFileSync(uploadStatePath, JSON.stringify(Object.fromEntries(storageIds), null, 2));
  console.log(`UPLOADED ${key}`);
}

const resolvedUrls = await client.query(api.replications.resolveStorageUrls, {
  storageIds: [...storageIds.values()],
});
const replacements = new Map(
  [...storageIds.keys()].map((key, index) => [key, resolvedUrls[index]]),
);
const knownReplacements = new Map(
  [...staleUrlToKey].map(([url, key]) => [url, replacements.get(key)]),
);

let repaired = 0;
for (const { effect, keys } of affected) {
  const changes = mediaFields.flatMap((field) => {
    if (effect[field] === undefined) return [];
    const value = replaceKnownUrls(
      replaceLegacyArticleMedia(effect[field], replacements),
      knownReplacements,
    );
    return JSON.stringify(value) === JSON.stringify(effect[field])
      ? []
      : [{ field, expected: effect[field], value }];
  });
  const socialKey = isLegacyArticleMediaUrl(effect.social_media_image)
    ? legacyArticleMediaKey(effect.social_media_image)
    : staleUrlToKey.get(effect.social_media_image);
  const clearSocialMediaImage = Boolean(socialKey && !replacements.has(socialKey));
  const replacementSocial = socialKey ? replacements.get(socialKey) : null;
  await client.mutation(api.subjectiveEffects.repairLegacyMedia, {
    apiKey: credential.token,
    slug: effect.slug,
    changes,
    clearSocialMediaImage,
    expectedSocialMediaImage: clearSocialMediaImage || replacementSocial
      ? effect.social_media_image
      : undefined,
    replacementSocialMediaImage: replacementSocial ?? undefined,
  });
  repaired += 1;
  console.log(`REPAIRED ${effect.slug} (${keys.size} media keys)`);
}
console.log(`Uploaded: ${replacements.size}`);
console.log(`Repaired effects: ${repaired}`);
