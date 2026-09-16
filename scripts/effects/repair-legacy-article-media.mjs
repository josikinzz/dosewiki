#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { uploadReplicationBytes, r2MediaPublicUrl } from "../replications/lib/r2-upload.mjs";
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
if (!command.targetUrl) throw new Error("Pass an explicit --target for dry runs and writes.");
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

const client = createDataClient({ target: command.targetUrl }).client;
const uploadStatePath = join(
  recoveryDir,
  `uploads-${encodeURIComponent(command.deploymentFingerprint)}.json`,
);
const uploadState = existsSync(uploadStatePath)
  ? JSON.parse(readFileSync(uploadStatePath, "utf8"))
  : {};
const priorEntries = Object.entries(uploadState);
const priorUrls = await client.query(api.replications.resolveStorageUrls, {
  storageIds: priorEntries.map(([, value]) => value.split("/").at(-1)),
});
const staleUrlToKey = new Map(priorEntries.flatMap(([key, value], index) => {
  const url = /^https?:\/\//.test(value) ? value : priorUrls[index];
  return url ? [[url, key]] : [];
}));
const nativeStatePath = join(recoveryDir, `r2-uploads-${encodeURIComponent(command.deploymentFingerprint)}.json`);
const nativeState = existsSync(nativeStatePath)
  ? JSON.parse(readFileSync(nativeStatePath, "utf8"))
  : { target: command.deploymentFingerprint, r2Keys: {} };
if (nativeState.target !== command.deploymentFingerprint) throw new Error("R2 upload ledger belongs to another Postgres target.");
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
  const { body, contentType, file } = mediaForKey(key);
  const r2Key = await uploadReplicationBytes(client, credential.token, body, contentType, extname(file));
  if (nativeState.r2Keys[key] && nativeState.r2Keys[key] !== r2Key) throw new Error(`Recovered media changed for ${key}.`);
  nativeState.r2Keys[key] = r2Key;
  writeFileSync(nativeStatePath, JSON.stringify(nativeState, null, 2));
  console.log(`UPLOADED ${key}`);
}

const replacements = new Map(
  recoverable.map((key) => [key, r2MediaPublicUrl(nativeState.r2Keys[key])]),
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
