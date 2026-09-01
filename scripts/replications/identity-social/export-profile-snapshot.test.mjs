import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { drainPinnedProfileSnapshot, exportPinnedProfileSnapshot } from "./export-profile-snapshot.mjs";
import { canonicalProfileSnapshotDigest } from "./executor-lib.mjs";
import { PINNED_PROFILE_SNAPSHOT_DIGEST } from "./executor-lib.mjs";

test("client drains bounded pages and rejects a wrong recomputed 2,119-row digest", async () => {
  const rows = Array.from({ length: 2119 }, (_, index) => ({ profileId: `profile-${index}`, key: `KEY${index}`, displayName: `Person ${index}`, aliases: [], avatarUrl: null, bio: "", links: [], hasCustomBio: false, replicationOrder: [], reportOrder: [], role: null }));
  let offset = 0; let calls = 0;
  const query = async (_ref, args) => {
    calls += 1; assert.equal(args.limit, 100);
    const page = rows.slice(offset, offset + 100); offset += page.length;
    return { profiles: page, cursor: offset < rows.length ? String(offset) : null, isDone: offset >= rows.length, profile_count: 2119, canonical_profile_set_sha256: PINNED_PROFILE_SNAPSHOT_DIGEST };
  };
  await assert.rejects(() => drainPinnedProfileSnapshot({ query, apiKey: "secret", actor: "editor@example.test" }), /canonical digest mismatch/);
  assert.equal(calls, 22);
});

test("credential resolver passes the scoped token string to Convex", async () => {
  const envVar = "CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE";
  const previous = process.env[envVar];
  process.env[envVar] = "test-token-value";
  try {
    await assert.rejects(
      () => exportPinnedProfileSnapshot(
        ["--actor-email=editor@example.test", "--out=/unused/test-snapshot.json"],
        {
          query: async (_ref, args) => {
            assert.equal(args.apiKey, "test-token-value");
            throw new Error("credential-contract-proved");
          },
        },
      ),
      /credential-contract-proved/,
    );
  } finally {
    if (previous === undefined) delete process.env[envVar];
    else process.env[envVar] = previous;
  }
});

test("profile snapshot CAS preserves the reviewed compact field-order serializer", () => {
  const rows = [{
    profileId: "profile-1", key: "alice", displayName: "Alice", aliases: ["A"],
    avatarUrl: null, bio: "", links: [], hasCustomBio: false,
    replicationOrder: [], reportOrder: [], role: null,
  }];
  const expectedBytes = JSON.stringify([{
    key: "ALICE", displayName: "Alice", aliases: ["a"], avatarUrl: null,
    bio: "", links: [], hasCustomBio: false, replicationOrder: [],
    reportOrder: [], role: null,
  }]);
  const expected = createHash("sha256").update(expectedBytes).digest("hex");
  assert.equal(canonicalProfileSnapshotDigest(rows), expected);
});
