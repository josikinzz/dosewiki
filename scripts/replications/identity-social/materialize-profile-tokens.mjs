#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import { requireProductionWriteCredential } from "../../lib/production-write-command.mjs";
import { appendLedger, digest, PINNED_PROFILE_SNAPSHOT_DIGEST } from "./executor-lib.mjs";
import { drainPinnedProfileSnapshot } from "./export-profile-snapshot.mjs";

const TARGET_URL = "https://glad-minnow-656.convex.cloud";
const flag = (argv, name) => { const value = argv.find((item) => item.startsWith(`${name}=`)); return value ? value.slice(name.length + 1) : null; };
const normalize = (value) => String(value ?? "").trim().toLowerCase();

export function deriveIdentityTokenPayload(profiles) {
  const owners = new Map();
  for (const profile of profiles) {
    const tokens = new Set([profile.key, profile.displayName, ...(profile.aliases ?? [])].map(normalize).filter(Boolean));
    for (const token of tokens) {
      const ids = owners.get(token) ?? new Set(); ids.add(profile.profileId); owners.set(token, ids);
    }
  }
  return [...owners.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([normalized_token, ids]) => ({ normalized_token, owner_profile_ids: [...ids].sort() }));
}

export async function materializeProfileTokens(argv = process.argv.slice(2), adapters = {}) {
  const actor = flag(argv, "--actor-email"); const ledger = flag(argv, "--ledger"); const requestedMode = flag(argv, "--mode") ?? "dry-run";
  if (!actor || !ledger || !["dry-run", "seed", "rollback"].includes(requestedMode)) throw new Error("--actor-email, --ledger, and --mode=dry-run|seed|rollback are required.");
  const apiKey = adapters.apiKey ?? requireProductionWriteCredential("replicationMaintenance").token;
  const client = adapters.client ?? new ConvexHttpClient(TARGET_URL);
  const query = adapters.query ?? ((ref, args) => client.query(ref, args));
  const mutate = adapters.mutate ?? ((ref, args) => client.mutation(ref, args));
  const { profiles, metadata } = await drainPinnedProfileSnapshot({ query, apiKey, actor });
  const profile_ids = profiles.map((profile) => profile.profileId).sort();
  const profile_ids_digest = digest(profile_ids); const tokens = deriveIdentityTokenPayload(profiles);
  const operation_id = `identity-social-token-snapshot:${PINNED_PROFILE_SNAPSHOT_DIGEST.slice(0, 24)}:${profile_ids_digest.slice(0, 16)}`;
  const args = { apiKey, actor_email: actor, operation_id, mode: requestedMode === "rollback" ? "rollback" : "seed", dry_run: requestedMode === "dry-run", snapshot_digest: metadata.canonical_profile_set_sha256, profile_ids_digest, profile_ids, tokens };
  appendLedger(ledger, { event: "identity-token-materialization-requested", mode: requestedMode, operation_id, snapshot_digest: metadata.canonical_profile_set_sha256, profile_ids_digest, profile_count: profiles.length, token_count: tokens.length, at: Date.now() });
  const result = await mutate(api.replicationIdentitySocial.materializeIdentityTokenSnapshot, args);
  if (requestedMode !== "dry-run") {
    const receipt = await query(api.replicationIdentitySocial.getIdentityTokenMaterializationReceiptAuthenticated, { apiKey, actor_email: actor, snapshot_digest: metadata.canonical_profile_set_sha256 });
    if (requestedMode === "seed" && (!receipt || receipt.operation_id !== operation_id || receipt.profile_ids_digest !== profile_ids_digest || receipt.token_count !== tokens.length)) throw new Error("Identity-token materialization readback verification failed.");
    if (requestedMode === "rollback" && receipt) throw new Error("Identity-token materialization rollback readback still exists.");
  }
  appendLedger(ledger, { event: requestedMode === "rollback" ? "identity-token-materialization-rolled-back" : result.dry_run ? "identity-token-materialization-dry-run-verified" : "identity-token-materialization-seeded", operation_id, result, at: Date.now() });
  return { ...result, token_count: tokens.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) materializeProfileTokens().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
