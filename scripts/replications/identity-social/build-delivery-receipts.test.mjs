import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Readable } from "node:stream";
import { buildDeliveryReceipts } from "./build-delivery-receipts.mjs";
import { digest } from "./executor-lib.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const operations = []; const avatarRecords = []; const socialRecords = []; const cards = { effects: {}, replications: {}, reports: {}, contributors: {} }; const bodies = new Map();
  const avatarPlan = "a".repeat(64), socialPlan = "b".repeat(64);
  for (let index = 0; index < 7; index += 1) {
    const bytes = Buffer.from(`avatar-${index}`), sha256 = hash(bytes), key = `media/sha256/${sha256.slice(0, 2)}/${sha256}.webp`, publicUrl = `https://cdn.test/${key}`, profileKey = `PROFILE${index}`;
    operations.push({ operationId: `avatar-${index}`, kind: "profile-avatar", target: { profileKey }, after: { derivativeSha256: sha256, derivativeByteSize: bytes.length } });
    avatarRecords.push({ type: "object", status: "remote-verified", planDigest: avatarPlan, profileKey, key, publicUrl, sha256, byteSize: bytes.length, timestamp: 100 + index }); bodies.set(publicUrl, bytes);
  }
  const sharedBytes = Buffer.from("shared-social-object");
  for (let index = 0; index < 9172; index += 1) {
    const bytes = index >= 9170 ? sharedBytes : Buffer.from(`social-${index}`), sha256 = hash(bytes), key = `media/sha256/${sha256.slice(0, 2)}/${sha256}.jpg`, url = `https://cdn.test/${key}`, entityType = ["effects", "replications", "reports", "contributors"][index % 4], entityKey = `entity-${index}`;
    operations.push({ operationId: `social-${index}`, kind: "social-asset", target: { entityType, entityKey }, after: { sha256, byteSize: bytes.length } }); cards[entityType][entityKey] = url; bodies.set(url, bytes);
  }
  for (const [url, bytes] of bodies) {
    if (url.endsWith(".webp")) continue;
    const sha256 = hash(bytes), key = new URL(url).pathname.slice(1);
    socialRecords.push({ type: "object", status: socialRecords.length % 2 ? "uploaded-verified" : "verified-reuse", planDigest: socialPlan, key, sha256, size: bytes.length, recordedAt: "2026-09-01T00:00:00.000Z" });
  }
  socialRecords.push({ type: "full-complete", planDigest: socialPlan, objectCount: 9171, recordedAt: "2026-09-01T01:00:00.000Z" });
  const projectionCore = { artifactType: "replication-identity-social-local-projection", operations };
  const projection = { ...projectionCore, projectionSha256: digest(projectionCore) };
  avatarRecords.push({ type: "full-complete", planDigest: avatarPlan, projectionSha256: projection.projectionSha256, objectCount: 7, timestamp: 200 });
  return {
    projection, avatarRecords, socialRecords,
    candidate: { promotion: { planDigest: socialPlan, logicalCardCount: 9172, uniqueObjectCount: 9171 }, cards },
    fetchImpl: async (url) => ({ ok: true, status: 200, body: Readable.from([bodies.get(url)]) }),
  };
}

test("builds deterministic executor receipts for all avatar and logical social operations", async () => {
  const input = fixture(); const first = await buildDeliveryReceipts({ ...input, concurrency: 32 }); const second = await buildDeliveryReceipts({ ...input, concurrency: 1 });
  assert.deepEqual(second, first);
  assert.equal(first.counts.avatars, 7); assert.equal(first.counts.socialLogical, 9172); assert.equal(first.counts.socialUnique, 9171);
  assert.equal(Object.keys(first.receipts).length, 9179);
  const avatar = first.receipts["avatar-0"];
  assert.equal(avatar.publication_status, "verified-reuse"); assert.equal(avatar.source_ledger_status, "remote-verified"); assert.equal(avatar.binding_mode, "verify-only-existing-object");
  assert.equal(avatar.projection_sha256, first.baseProjectionSha256); assert.equal(avatar.receipt.content_sha256, avatar.sha256); assert.match(avatar.receipt.receipt_digest, /^[0-9a-f]{64}$/);
  assert.match(first.receiptSidecarSha256, /^[0-9a-f]{64}$/);
  assert.equal(first.receipts["social-9170"].r2_key, first.receipts["social-9171"].r2_key);
});

test("fails closed on a missing object or collision status", async () => {
  const missing = fixture(); missing.socialRecords.splice(0, 1);
  await assert.rejects(buildDeliveryReceipts(missing), /covers 9170\/9171/);
  const collision = fixture(); collision.socialRecords[0].status = "collision";
  await assert.rejects(buildDeliveryReceipts(collision), /blocking status collision/);
});

test("fails when CDN full bytes do not match the ledger", async () => {
  const input = fixture(); input.fetchImpl = async () => ({ ok: true, status: 200, body: Readable.from([Buffer.from("wrong")]) });
  await assert.rejects(buildDeliveryReceipts(input), /CDN collision/);
});

test("refuses an avatar reuse ledger bound to an older base projection", async () => {
  const input = fixture(); input.avatarRecords.at(-1).projectionSha256 = "d".repeat(64);
  await assert.rejects(buildDeliveryReceipts(input), /targets a different base projection/);
});
