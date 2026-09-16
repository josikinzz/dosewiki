import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { drainPinnedProfileSnapshot } from "./export-profile-snapshot.mjs";
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
