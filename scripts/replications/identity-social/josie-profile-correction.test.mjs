import assert from "node:assert/strict";
import test from "node:test";
import { digest } from "./executor-lib.mjs";
import {
  JOSIE_PERSONAL_WEBSITE,
  JOSIE_PROFILE_ID,
  JOSIE_REPLACEMENT_AVATAR,
  JOSIE_RESTORED_AVATAR,
  assertJosieCorrectionLiveState,
  buildJosieProfileCorrection,
} from "./josie-profile-correction-lib.mjs";

function receipt(overrides = {}) {
  const core = {
    url: JOSIE_RESTORED_AVATAR.publicUrl,
    content_sha256: JOSIE_RESTORED_AVATAR.sha256,
    byte_size: JOSIE_RESTORED_AVATAR.byteSize,
    http_status: 200,
    verified_at: 1_788_238_085_744,
    verifier: "dosewiki-admin/identity-social-full-byte-verifier-v1",
    ...overrides,
  };
  return { ...core, receipt_digest: digest(core) };
}

test("builds an exact avatar CAS and personal-site-only profile correction", () => {
  const plan = buildJosieProfileCorrection({ receipt: receipt() });
  assert.equal(plan.profileId, JOSIE_PROFILE_ID);
  assert.deepEqual(plan.avatar.entries[0].projection.expectedBefore, {
    currentAvatarSha256: JOSIE_REPLACEMENT_AVATAR.sha256,
    currentAvatarUrl: JOSIE_REPLACEMENT_AVATAR.publicUrl,
    currentAvatarProvenance: "profile-controlled",
  });
  assert.equal(plan.avatar.entries[0].value.media_digest, JOSIE_RESTORED_AVATAR.sha256);
  assert.equal(plan.avatar.entries[0].value.public_url, JOSIE_RESTORED_AVATAR.publicUrl);
  assert.equal(plan.avatar.entries[0].value.delivery_verification, "verified");
  assert.deepEqual(plan.profile.entries[0].profile.links, [JOSIE_PERSONAL_WEBSITE]);
  assert.ok(plan.profile.entries[0].expected.links.some((link) => link.url.includes("reddit.com")));
  assert.ok(!plan.profile.entries[0].profile.links.some((link) => /reddit|psychonaut/i.test(link.url)));
  assert.deepEqual(plan.rollback.map((item) => item.kind), ["profile", "avatar"]);
});

test("rejects receipts for different bytes, URLs, or verifier identities", () => {
  assert.throws(() => buildJosieProfileCorrection({ receipt: receipt({ content_sha256: "0".repeat(64) }) }), /bytes/);
  assert.throws(() => buildJosieProfileCorrection({ receipt: receipt({ url: "https://example.test/avatar.webp" }) }), /URL/);
  assert.throws(() => buildJosieProfileCorrection({ receipt: receipt({ verifier: "other" }) }), /trusted/);
});

test("requires both restored and replaced avatar history during final readback", () => {
  const plan = buildJosieProfileCorrection({ receipt: receipt() });
  const profile = {
    _id: JOSIE_PROFILE_ID,
    key: "JOSIE",
    avatarUrl: JOSIE_RESTORED_AVATAR.publicUrl,
    avatarSha256: JOSIE_RESTORED_AVATAR.sha256,
    avatarProvenance: "profile-controlled",
    links: [JOSIE_PERSONAL_WEBSITE],
  };
  assert.equal(assertJosieCorrectionLiveState({
    profile,
    avatarHistory: [
      { media_digest: JOSIE_REPLACEMENT_AVATAR.sha256 },
      { media_digest: JOSIE_RESTORED_AVATAR.sha256 },
    ],
  }, plan), true);
  assert.throws(() => assertJosieCorrectionLiveState({
    profile,
    avatarHistory: [{ media_digest: JOSIE_RESTORED_AVATAR.sha256 }],
  }, plan), /replaced campaign avatar/);
});
