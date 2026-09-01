#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import { requireProductionWriteCredential } from "../../lib/production-write-command.mjs";
import { PINNED_PROFILE_COUNT, PINNED_PROFILE_SNAPSHOT_DIGEST, validatePinnedProfileSnapshot } from "./executor-lib.mjs";

const TARGET_URL = "https://glad-minnow-656.convex.cloud";
const flag = (argv, name) => { const value = argv.find((item) => item.startsWith(`${name}=`)); return value ? value.slice(name.length + 1) : null; };

export async function exportPinnedProfileSnapshot(argv = process.argv.slice(2), adapters = {}) {
  const actor = flag(argv, "--actor-email"); const out = flag(argv, "--out");
  if (!actor || !out) throw new Error("--actor-email and --out are required.");
  const apiKey = adapters.apiKey ?? requireProductionWriteCredential("replicationMaintenance").token;
  const client = adapters.client ?? new ConvexHttpClient(TARGET_URL);
  const query = adapters.query ?? ((ref, args) => client.query(ref, args));
  const { profiles, metadata } = await drainPinnedProfileSnapshot({ query, apiKey, actor });
  const document = { artifactType: "identity-social-pinned-contributor-profile-snapshot", schemaVersion: 1, target: "glad-minnow-656", ...metadata, profiles };
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
  return { out, profiles: profiles.length, digest: metadata.canonical_profile_set_sha256 };
}

export async function drainPinnedProfileSnapshot({ query, apiKey, actor }) {
  const profiles = []; let cursor = undefined; let metadata = null;
  do {
    const page = await query(api.replicationIdentitySocial.exportPinnedProfileSnapshotPageAuthenticated, { apiKey, actor_email: actor, ...(cursor ? { cursor } : {}), limit: 100 });
    if (page.profile_count !== PINNED_PROFILE_COUNT || page.canonical_profile_set_sha256 !== PINNED_PROFILE_SNAPSHOT_DIGEST) throw new Error("Authenticated export metadata does not match the pinned profile snapshot.");
    if (metadata && (metadata.profile_count !== page.profile_count || metadata.canonical_profile_set_sha256 !== page.canonical_profile_set_sha256)) throw new Error("Profile snapshot metadata drifted between pages.");
    metadata = { profile_count: page.profile_count, canonical_profile_set_sha256: page.canonical_profile_set_sha256 };
    profiles.push(...page.profiles); cursor = page.cursor ?? undefined;
  } while (cursor);
  validatePinnedProfileSnapshot({ profiles });
  return { profiles, metadata };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) exportPinnedProfileSnapshot().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
