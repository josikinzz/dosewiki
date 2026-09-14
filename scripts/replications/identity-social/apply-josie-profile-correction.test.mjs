import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";
import { digest } from "./executor-lib.mjs";
import {
  JOSIE_PERSONAL_WEBSITE,
  JOSIE_PROFILE_ID,
  JOSIE_REPLACEMENT_AVATAR,
  JOSIE_RESTORED_AVATAR,
  buildJosieProfileCorrection,
} from "./josie-profile-correction-lib.mjs";
import { fetchTrustedAvatarReceipt, runJosieProfileCorrection } from "./apply-josie-profile-correction.mjs";

const functionName = (ref) => getFunctionName(ref);

function trustedReceipt() {
  const core = {
    url: JOSIE_RESTORED_AVATAR.publicUrl,
    content_sha256: JOSIE_RESTORED_AVATAR.sha256,
    byte_size: JOSIE_RESTORED_AVATAR.byteSize,
    http_status: 200,
    verified_at: 1_788_238_085_744,
    verifier: "dosewiki-admin/identity-social-full-byte-verifier-v1",
  };
  return { ...core, receipt_digest: digest(core) };
}

function currentReadback() {
  return {
    profile: {
      _id: JOSIE_PROFILE_ID,
      key: "JOSIE",
      displayName: "Josie Kins",
      avatarUrl: JOSIE_REPLACEMENT_AVATAR.publicUrl,
      avatarR2Key: JOSIE_REPLACEMENT_AVATAR.r2Key,
      avatarStorageId: null,
      avatarSha256: JOSIE_REPLACEMENT_AVATAR.sha256,
      avatarProvenance: "profile-controlled",
      links: [JOSIE_PERSONAL_WEBSITE, { label: "Reddit", url: "https://www.reddit.com/user/josikins/" }],
    },
    avatarHistory: [{ media_digest: JOSIE_REPLACEMENT_AVATAR.sha256 }],
  };
}

function finalReadback() {
  return {
    profile: {
      _id: JOSIE_PROFILE_ID,
      key: "JOSIE",
      displayName: "Josie Kins",
      avatarUrl: JOSIE_RESTORED_AVATAR.publicUrl,
      avatarR2Key: null,
      avatarStorageId: null,
      avatarSha256: JOSIE_RESTORED_AVATAR.sha256,
      avatarProvenance: "profile-controlled",
      links: [JOSIE_PERSONAL_WEBSITE],
    },
    avatarHistory: [
      { media_digest: JOSIE_REPLACEMENT_AVATAR.sha256 },
      { media_digest: JOSIE_RESTORED_AVATAR.sha256 },
    ],
  };
}

function command(writeRequested) {
  return {
    operation: "restore-josie-profile-curation",
    targetUrl: "https://glad-minnow-656.convex.cloud",
    deploymentFingerprint: "glad-minnow-656",
    targetSource: "--target-url",
    writeRequested,
    dryRun: !writeRequested,
    confirmationPhrase: writeRequested ? "restore-josie-profile-curation" : null,
    expectedDeployment: writeRequested ? "glad-minnow-656" : null,
    compatibilityTargetsPresent: [],
  };
}

function baseAdapters(overrides = {}) {
  const events = [];
  const rollbacks = [];
  return {
    events,
    rollbacks,
    adapters: {
      command: command(false),
      credential: { token: "test-token" },
      loadLedger: () => [],
      appendLedger: (_path, event) => events.push(event),
      writeRollbackManifest: (_path, value) => rollbacks.push(value),
      fetchReceipt: async () => trustedReceipt(),
      ...overrides,
    },
  };
}

test("fetches and hashes the deployed restored avatar bytes", async () => {
  const bytes = new Uint8Array(JOSIE_RESTORED_AVATAR.byteSize);
  // The fixture cannot cheaply synthesize the real digest, so a mismatched
  // body proves the verifier fails closed before producing a receipt.
  await assert.rejects(() => fetchTrustedAvatarReceipt(async () => new Response(bytes, { status: 200 })), /bytes/);
});

test("dry-run is default and stops before any profile-link mutation", async () => {
  const mutations = [];
  const queries = [];
  const { events, adapters } = baseAdapters({
    query: async (ref) => {
      queries.push(ref);
      if (functionName(ref) === "replicationIdentitySocial:getProfileCurationReadbackAuthenticated") return currentReadback();
      if (functionName(ref) === "replicationIdentitySocial:getOperationCompletionReceiptAuthenticated") return null;
      if (functionName(ref) === "replicationIdentitySocial:previewCanonicalBeforeAuthenticated") {
        return { matches: true, digest: digest({
          currentAvatarSha256: JOSIE_REPLACEMENT_AVATAR.sha256,
          currentAvatarUrl: JOSIE_REPLACEMENT_AVATAR.publicUrl,
          currentAvatarProvenance: "profile-controlled",
        }) };
      }
      if (functionName(ref) === "replicationIdentitySocial:preflightBatchEntryAuthenticated") return { matches: true };
      throw new Error("Unexpected query");
    },
    mutate: async (ref, args) => {
      mutations.push({ ref, args });
      return { changed: 1, unchanged: 0, dry_run: args.dry_run };
    },
  });
  const result = await runJosieProfileCorrection(["--actor-email=editor@example.test"], adapters);
  assert.deepEqual({ mode: result.mode, status: result.status, wrote: result.wrote }, { mode: "dry-run", status: "ready", wrote: false });
  assert.equal(mutations.length, 1);
  assert.equal(functionName(mutations[0].ref), "replicationIdentitySocial:applyBatch");
  assert.equal(mutations[0].args.dry_run, true);
  assert.ok(!mutations.some((item) => functionName(item.ref) === "contributorProfiles:importReviewedProfilePlan"));
  assert.ok(events.some((event) => event.event === "avatar-dry-run-verified"));
  assert.equal(functionName(queries[queries.length - 1]), "replicationIdentitySocial:preflightBatchEntryAuthenticated");
});

test("write mode applies avatar, verifies its receipt, then updates links and performs final readback", async () => {
  const calls = [];
  let state = currentReadback();
  let avatarApplied = false;
  const { events, rollbacks, adapters } = baseAdapters({
    command: command(true),
    query: async (ref) => {
      calls.push(ref);
      if (functionName(ref) === "replicationIdentitySocial:getProfileCurationReadbackAuthenticated") return state;
      if (functionName(ref) === "replicationIdentitySocial:getOperationCompletionReceiptAuthenticated") {
        return avatarApplied ? { all_live_match: true, item_count: 1, payload_digest: "a" } : null;
      }
      if (functionName(ref) === "replicationIdentitySocial:previewCanonicalBeforeAuthenticated") {
        return { matches: true, digest: digest({
          currentAvatarSha256: JOSIE_REPLACEMENT_AVATAR.sha256,
          currentAvatarUrl: JOSIE_REPLACEMENT_AVATAR.publicUrl,
          currentAvatarProvenance: "profile-controlled",
        }) };
      }
      if (functionName(ref) === "replicationIdentitySocial:preflightBatchEntryAuthenticated") return { matches: true };
      throw new Error("Unexpected query");
    },
    mutate: async (ref, args) => {
      calls.push(ref);
      if (functionName(ref) === "replicationIdentitySocial:applyBatch") {
        assert.equal(args.dry_run, false);
        avatarApplied = true;
        state = finalReadback();
        state.profile.links = currentReadback().profile.links;
        return { changed: 1, unchanged: 0, payload_digest: "a" };
      }
      if (functionName(ref) === "contributorProfiles:importReviewedProfilePlan" && args.dryRun) {
        assert.equal(avatarApplied, true);
        return { blocked: 0, created: 0, updated: 1, unchanged: 0 };
      }
      if (functionName(ref) === "contributorProfiles:importReviewedProfilePlan") {
        assert.equal(avatarApplied, true);
        state = finalReadback();
        return { blocked: 0, created: 0, updated: 1, unchanged: 0 };
      }
      throw new Error("Unexpected mutation");
    },
  });
  const result = await runJosieProfileCorrection(["--write", "--actor-email=editor@example.test"], adapters);
  assert.equal(result.status, "complete");
  const callNames = calls.map(functionName);
  const avatarIndex = callNames.indexOf("replicationIdentitySocial:applyBatch");
  const receiptIndex = callNames.indexOf("replicationIdentitySocial:getOperationCompletionReceiptAuthenticated", avatarIndex + 1);
  const profileIndex = callNames.indexOf("contributorProfiles:importReviewedProfilePlan");
  assert.ok(avatarIndex >= 0 && receiptIndex > avatarIndex && profileIndex > receiptIndex);
  assert.ok(events.some((event) => event.event === "final-readback-verified"));
  assert.deepEqual(rollbacks.at(-1).operations.map((item) => item.kind), ["profile", "avatar"]);
});

test("idempotent resume performs no mutation when final readback already matches", async () => {
  const correction = buildJosieProfileCorrection({ receipt: trustedReceipt() });
  const mutations = [];
  const { adapters } = baseAdapters({
    command: command(true),
    loadLedger: () => [{ event: "correction-prepared", correction }],
    query: async (ref) => {
      assert.equal(functionName(ref), "replicationIdentitySocial:getProfileCurationReadbackAuthenticated");
      return finalReadback();
    },
    mutate: async (...args) => mutations.push(args),
  });
  const result = await runJosieProfileCorrection(["--write", "--actor-email=editor@example.test"], adapters);
  assert.equal(result.status, "already-complete");
  assert.equal(mutations.length, 0);
});

test("resume supersedes a prepared plan containing the formerly unsupported avatar action", async () => {
  const stale = buildJosieProfileCorrection({ receipt: trustedReceipt() });
  stale.avatar.entries[0].projection.action = "restore-owner-selected-pre-campaign-avatar";
  const events = [];
  const { adapters } = baseAdapters({
    loadLedger: () => [{ event: "correction-prepared", correction: stale }],
    appendLedger: (_path, event) => events.push(event),
    query: async (ref, args) => {
      if (functionName(ref) === "replicationIdentitySocial:getProfileCurationReadbackAuthenticated") return currentReadback();
      if (functionName(ref) === "replicationIdentitySocial:getOperationCompletionReceiptAuthenticated") return null;
      if (functionName(ref) === "replicationIdentitySocial:previewCanonicalBeforeAuthenticated") {
        return { matches: true, digest: args.entry.projection.expectedBeforeSha256 };
      }
      if (functionName(ref) === "replicationIdentitySocial:preflightBatchEntryAuthenticated") return { matches: true };
      throw new Error("Unexpected query");
    },
    mutate: async (_ref, args) => ({ changed: 1, unchanged: 0, dry_run: args.dry_run }),
  });
  await runJosieProfileCorrection(["--actor-email=editor@example.test"], adapters);
  const replacement = events.find((event) => event.supersedes_unsupported_avatar_action);
  assert.equal(replacement.supersedes_unsupported_avatar_action, "restore-owner-selected-pre-campaign-avatar");
  assert.equal(replacement.correction.avatar.entries[0].projection.action, "propose-provenance-improving-avatar-replacement");
});
