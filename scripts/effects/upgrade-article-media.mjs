#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { uploadReplicationFile, r2MediaPublicUrl } from "../replications/lib/r2-upload.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";

const operation = "upgrade-article-media";
const command = createProductionWriteCommand({ operation });
if (!command.targetUrl) throw new Error("Pass an explicit --target for dry runs and writes.");
printProductionWriteCommand(command);

const args = process.argv.slice(2);
const upgradeDir = getFlagValue(args, "--upgrade-dir");
const previousStatePath = getFlagValue(args, "--previous-upload-state");
if (!upgradeDir || !previousStatePath) {
  throw new Error("Pass --upgrade-dir and --previous-upload-state.");
}

const manifest = JSON.parse(readFileSync(join(upgradeDir, "manifest.json"), "utf8"));
const previousState = JSON.parse(readFileSync(previousStatePath, "utf8"));
const deployment = encodeURIComponent(command.deploymentFingerprint);
const uploadStatePath = join(upgradeDir, `r2-uploads-${deployment}.json`);
const uploadState = existsSync(uploadStatePath)
  ? JSON.parse(readFileSync(uploadStatePath, "utf8"))
  : { target: command.deploymentFingerprint, r2Keys: {} };
if (uploadState.target !== command.deploymentFingerprint) throw new Error("R2 upload ledger belongs to another Postgres target.");
const client = createDataClient({ target: command.targetUrl }).client;
const previousValues = manifest.map(({ key }) => {
  const value = previousState.r2Keys?.[key] ?? previousState[key];
  if (typeof value !== "string" || !value) throw new Error(`Previous media identity missing for ${key}.`);
  return value;
});
if (previousState.target && previousState.target !== command.deploymentFingerprint) throw new Error("Previous upload ledger belongs to another Postgres target.");
const historicalUrls = await client.query(api.replications.resolveStorageUrls, {
  storageIds: previousValues.map((value) => value.startsWith("media/") || /^https?:\/\//.test(value) ? "" : value),
});
const oldUrls = new Map(manifest.map(({ key }, index) => {
  const value = previousValues[index];
  const url = value.startsWith("media/") ? r2MediaPublicUrl(value) : /^https?:\/\//.test(value) ? value : historicalUrls[index];
  if (!url) throw new Error(`Previous media URL cannot be resolved for ${key}.`);
  return [key, url];
}));

const mediaFields = [
  "description_raw", "description_ast", "long_summary_raw", "long_summary_ast",
  "analysis_raw", "analysis_ast", "style_variations_raw", "style_variations_ast",
  "personal_commentary_raw", "personal_commentary_ast",
];

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

const effects = await client.query(api.subjectiveEffects.getAll, {});
const usedKeys = manifest.filter(({ key }) => {
  const oldUrl = oldUrls.get(key);
  return effects.some((effect) =>
    mediaFields.some((field) => containsUrl(effect[field], oldUrl)) ||
    effect.social_media_image === oldUrl,
  );
});
const affectedEffects = effects.filter((effect) => usedKeys.some(({ key }) => {
  const oldUrl = oldUrls.get(key);
  return mediaFields.some((field) => containsUrl(effect[field], oldUrl)) ||
    effect.social_media_image === oldUrl;
}));

console.log(`Verified upgrades: ${manifest.length}`);
console.log(`Upgrades currently referenced: ${usedKeys.length}`);
console.log(`Affected effects: ${affectedEffects.length}`);
if (usedKeys.length !== manifest.length) {
  const missing = manifest.filter(({ key }) => !usedKeys.some((item) => item.key === key));
  throw new Error(`Expected every upgrade to be referenced; missing: ${missing.map(({ key }) => key).join(", ")}`);
}
if (command.dryRun) {
  console.log("Uploads: 0");
  console.log("Writes: 0");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");
for (const item of usedKeys) {
  const r2Key = await uploadReplicationFile(client, credential.token, join(upgradeDir, item.file), item.contentType);
  if (uploadState.r2Keys[item.key] && uploadState.r2Keys[item.key] !== r2Key) throw new Error(`Upgrade bytes changed for ${item.key}.`);
  uploadState.r2Keys[item.key] = r2Key;
  writeFileSync(uploadStatePath, JSON.stringify(uploadState, null, 2));
  console.log(`UPLOADED ${item.key}`);
}

const replacements = new Map(usedKeys.map(({ key }) => [key, r2MediaPublicUrl(uploadState.r2Keys[key])]));
let repaired = 0;
for (const effect of affectedEffects) {
  const changes = mediaFields.flatMap((field) => {
    if (effect[field] === undefined) return [];
    let value = effect[field];
    for (const { key } of usedKeys) value = replaceUrl(value, oldUrls.get(key), replacements.get(key));
    return JSON.stringify(value) === JSON.stringify(effect[field])
      ? []
      : [{ field, expected: effect[field], value }];
  });
  const socialKey = usedKeys.find(({ key }) => effect.social_media_image === oldUrls.get(key))?.key;
  await client.mutation(api.subjectiveEffects.repairLegacyMedia, {
    apiKey: credential.token,
    slug: effect.slug,
    changes,
    expectedSocialMediaImage: socialKey ? effect.social_media_image : undefined,
    replacementSocialMediaImage: socialKey ? replacements.get(socialKey) : undefined,
    clearSocialMediaImage: false,
  });
  repaired += 1;
  console.log(`REPAIRED ${effect.slug}`);
}
console.log(`Uploaded: ${usedKeys.length}`);
console.log(`Repaired effects: ${repaired}`);
