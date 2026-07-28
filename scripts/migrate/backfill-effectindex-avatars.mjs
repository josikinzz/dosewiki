#!/usr/bin/env node
/** Backfill recovered Effect Index avatars without replacing a current avatar. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { assertDataOpsWriteAllowed, createDataOpsRunContext, printDataOpsRunContext, requireAdminIntentToken, requireTargetUrl } from "../lib/data-ops-run-context.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const PROBE_PATH = path.join(REPO_ROOT, "notes-and-plans/reports/media-recovery-probe-results.json");
const AVATAR_ROOT = path.join(REPO_ROOT, "public/profile-avatars");
const SCRIPT_UPDATED_BY = "backfill-effectindex-avatars";
const identityDefinitions = [
  { key: "JOSIE", aliases: ["josie", "josikinz"] }, { key: "VISCID", aliases: ["viscid"] }, { key: "MAETHOR", aliases: ["maethor"] }, { key: "UTHERAPTOR", aliases: ["utheraptor"] }, { key: "HYPNAGOGIST", aliases: ["hypnagogist"] }, { key: "STINGRAYZ", aliases: ["stingrayz"] }, { key: "RHO", aliases: ["rho"] }, { key: "NATALIE", aliases: ["natalie"] }, { key: "NERVEWING", aliases: ["nervewing"] },
];
const writeRequested = process.argv.includes("--write");
const confirmed = process.argv.includes("--confirm-avatar-backfill");
const onlineDryRun = process.argv.includes("--online");
function extension(media) {
  const value = path.extname(media).slice(1).toLowerCase();
  if (!["jpg", "jpeg", "png", "webp"].includes(value)) throw new Error(`Unsupported avatar extension: ${media}`);
  return value;
}
function chooseAssets() {
  const assets = Object.values(JSON.parse(fs.readFileSync(PROBE_PATH, "utf8")).assets).filter((asset) => asset.assetKind === "profile" && asset.located_url);
  const byAlias = new Map(identityDefinitions.flatMap((identity) => identity.aliases.map((alias) => [alias, identity])));
  const selected = new Map();
  const skipped = [];
  for (const asset of assets) {
    const identity = byAlias.get(String(asset.title).toLowerCase());
    if (!identity) { skipped.push({ asset, reason: "identity is outside the nine canonical Effect Index identities" }); continue; }
    const candidate = { identity, asset, ext: extension(asset.media), avatarUrl: `/profile-avatars/${identity.key.toLowerCase()}/avatar.${extension(asset.media)}` };
    if (selected.has(identity.key)) { skipped.push({ asset, reason: `alternate recovery for ${identity.key}; preserving the first recovered filename` }); continue; }
    selected.set(identity.key, candidate);
  }
  return { selected: [...selected.values()], skipped };
}
function rowFor(existing, candidate) {
  const row = { key: existing.key, displayName: existing.displayName, aliases: existing.aliases, bio: existing.bio, links: existing.links, membershipEmail: existing.membershipEmail, createdAt: existing.createdAt, avatarUrl: candidate.avatarUrl, updatedBy: SCRIPT_UPDATED_BY };
  if (existing.avatarStorageId) row.avatarStorageId = existing.avatarStorageId;
  return row;
}
async function downloadAvatar(candidate) {
  const response = await fetch(candidate.asset.located_url);
  if (!response.ok) throw new Error(`${candidate.asset.located_url} returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`${candidate.asset.located_url} returned an empty response`);
  return bytes;
}
async function main() {
  if (writeRequested && !confirmed) throw new Error("Writes require --write --confirm-avatar-backfill.");
  if (!fs.existsSync(PROBE_PATH)) throw new Error("The media-recovery probe report is unavailable.");
  const argv = process.argv.slice(2);
  const runContext = createDataOpsRunContext({ operation: "backfill Effect Index avatars", intent: "dev-convex-import", argv: writeRequested ? argv : [...argv, "--dry-run"], targetUrlKeys: ["TARGET_CONVEX_URL"], localArtifacts: [PROBE_PATH], confirmationFlag: "--confirm-avatar-backfill", destructive: true });
  const { selected, skipped } = chooseAssets();
  console.log(`Mode: ${writeRequested ? "write requested" : "dry run"}`);
  printDataOpsRunContext(runContext);
  console.log(`Recovered profile assets: ${selected.length + skipped.length}; canonical identity candidates: ${selected.length}.`);
  for (const candidate of selected) console.log(`PLAN ${candidate.identity.key} | ${candidate.asset.media} -> ${candidate.avatarUrl}`);
  for (const { asset, reason } of skipped) console.log(`SKIP ${asset.media} — ${reason}.`);
  if (!writeRequested && !onlineDryRun) { console.log(`Plan total: ${selected.filter((candidate) => candidate.identity.key !== "JOSIE").length} possible avatar backfill(s), subject to live empty-avatar guards.`); return; }
  if (!runContext.targetUrl) throw new Error("--online and --write require an explicit TARGET_CONVEX_URL.");
  if (writeRequested) assertDataOpsWriteAllowed(runContext);
  const credential = requireAdminIntentToken("profileMediaWrite");
  const client = new ConvexHttpClient(requireTargetUrl(runContext));
  const existing = new Map((await client.query(api.contributorProfiles.getForBulkImport, { apiKey: credential.token, keys: selected.map((candidate) => candidate.identity.key) })).map((row) => [row.key.toUpperCase(), row]));
  const updates = [];
  for (const candidate of selected) {
    if (candidate.identity.key === "JOSIE") { console.log("SKIP JOSIE — hard-protected from this backfill."); continue; }
    const profile = existing.get(candidate.identity.key);
    if (!profile) { console.log(`SKIP ${candidate.identity.key} — no contributorProfiles row.`); continue; }
    if (profile.avatarUrl) { console.log(`SKIP ${candidate.identity.key} — avatarUrl is already non-empty.`); continue; }
    const filePath = path.join(AVATAR_ROOT, candidate.identity.key.toLowerCase(), `avatar.${candidate.ext}`);
    // The file already being present is the normal case on the second and later
    // deployments: an earlier run against another deployment materialized it and
    // it is now a committed asset. The refusal exists to protect a file whose
    // bytes differ from what this run would write, so verify rather than assume
    // — matching bytes mean the asset is already correct and only the Convex
    // row is outstanding.
    const fileExists = fs.existsSync(filePath);
    updates.push({ candidate, profile, filePath, fileExists });
  }
  console.log(`Live empty-avatar plan: ${updates.length} row(s).`);
  if (!writeRequested) return;
  for (const update of updates) {
    // Re-check at the write boundary: a concurrent editor may have filled it
    // after the dry/live planning query, and this script must never replace it.
    const current = await client.query(api.contributorProfiles.getForBulkImport, { apiKey: credential.token, keys: [update.candidate.identity.key] });
    const currentProfile = current[0];
    if (!currentProfile) { console.log(`SKIP ${update.candidate.identity.key} before write — contributorProfiles row disappeared.`); continue; }
    if (currentProfile.avatarUrl) { console.log(`SKIP ${update.candidate.identity.key} before write — avatarUrl is already non-empty.`); continue; }
    const bytes = await downloadAvatar(update.candidate);
    if (update.fileExists) {
      // Identical bytes: the asset was materialized by an earlier deployment's
      // run. Differing bytes mean something else owns this path, and replacing
      // it is exactly what the original refusal was guarding against.
      if (!fs.readFileSync(update.filePath).equals(bytes)) {
        throw new Error(
          `Refusing to overwrite existing avatar file with different content: ${update.filePath}`,
        );
      }
      console.log(`REUSE ${update.candidate.identity.key} — existing file matches the recovered asset.`);
    } else {
      fs.mkdirSync(path.dirname(update.filePath), { recursive: true });
      fs.writeFileSync(update.filePath, bytes, { flag: "wx" });
    }
    await client.mutation(api.contributorProfiles.bulkImport, { apiKey: credential.token, profiles: [rowFor(currentProfile, update.candidate)] });
    console.log(`BACKFILLED ${update.candidate.identity.key} (${bytes.length} bytes).`);
  }
}
await main();
