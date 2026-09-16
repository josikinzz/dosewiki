import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_BUCKET,
  DEFAULT_REMOTE,
  OPERATION,
  assertRemoteDigest,
  buildPlan,
  canonicalKey,
  hasCanaryCompletion,
  makeDeliveryReceipt,
  processObjects,
  readLedger,
  requireWriteConfirmation,
  rcloneObject,
  sha256Bytes,
} from "./publish-avatars.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "avatar-publisher-"));
  const campaignRoot = path.join(root, "campaign");
  const bytes = Buffer.from("RIFF0000WEBPVP8 approved-avatar");
  const sha256 = sha256Bytes(bytes);
  const records = [];
  const operations = [];
  for (let index = 0; index < 7; index += 1) {
    const profileKey = `PROFILE${index}`;
    const derivativePath = `Data/campaign/derivatives/${profileKey}.webp`;
    const filename = path.join(campaignRoot, derivativePath);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes);
    records.push({
      profileKey,
      decision: "approve",
      stagedAsset: { derivativePath, derivativeSha256: sha256, derivativeBytes: bytes.length, derivativeFormat: "image/webp" },
    });
    operations.push({ kind: "profile-avatar", operationId: `op-${index}`, target: { profileKey }, after: { derivativeSha256: sha256, derivativeByteSize: bytes.length } });
  }
  const reviewPath = path.join(root, "review.json");
  const projectionPath = path.join(root, "projection.json");
  await writeFile(reviewPath, JSON.stringify({ counts: { approved: 7 }, validation: { productionWrites: 0 }, records }));
  await writeFile(projectionPath, JSON.stringify({ projectionSha256: "a".repeat(64), operations }));
  return { root, campaignRoot, reviewPath, projectionPath, bytes, sha256 };
}

describe("approved avatar publisher", () => {
  it("builds exactly seven content-addressed WebP objects tied to the projection", async () => {
    const files = await fixture();
    const plan = await buildPlan(files);
    assert.equal(plan.objects.length, 7);
    assert.equal(plan.projectionSha256, "a".repeat(64));
    assert.equal(plan.objects[0].key, canonicalKey(files.sha256));
    assert.match(plan.objects[0].publicUrl, /\/media\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/);
  });

  it("requires every exact write confirmation", async () => {
    const plan = await buildPlan(await fixture());
    const valid = [
      "--write", `--confirm-operation=${OPERATION}`, `--confirm-projection=${plan.projectionSha256}`,
      `--confirm-plan=${plan.planDigest}`, `--confirm-target=${DEFAULT_REMOTE}`, `--confirm-bucket=${DEFAULT_BUCKET}`,
    ];
    assert.doesNotThrow(() => requireWriteConfirmation(valid, plan, DEFAULT_REMOTE, DEFAULT_BUCKET));
    assert.throws(() => requireWriteConfirmation(valid.filter((value) => !value.startsWith("--confirm-plan")), plan, DEFAULT_REMOTE, DEFAULT_BUCKET), /confirm-plan/);
    assert.throws(() => requireWriteConfirmation(valid.with(4, "--confirm-target=other:bucket"), plan, DEFAULT_REMOTE, DEFAULT_BUCKET), /confirm-target/);
  });

  it("anchors keys beneath an explicit bucket and hard-fails byte collisions", () => {
    const sha = "b".repeat(64);
    const key = canonicalKey(sha);
    assert.equal(rcloneObject(DEFAULT_REMOTE, key), `${DEFAULT_REMOTE}/${key}`);
    assert.throws(() => rcloneObject("replications-r2:", key), /account root/);
    assert.throws(() => assertRemoteDigest({ key, sha256: sha, byteSize: 10 }, { sha256: "c".repeat(64), byteSize: 10 }), /IMMUTABLE COLLISION/);
  });

  it("creates a Postgres-compatible tamper-evident delivery receipt", () => {
    const object = { publicUrl: "https://cdn.test/a.webp", sha256: "d".repeat(64), byteSize: 42 };
    const receipt = makeDeliveryReceipt({ object, httpStatus: 200, verifiedAt: 1234, verifier: "test" });
    assert.deepEqual(Object.keys(receipt), ["url", "content_sha256", "byte_size", "http_status", "verified_at", "verifier", "receipt_digest"]);
    assert.match(receipt.receipt_digest, /^[0-9a-f]{64}$/);
  });

  it("runs canary first, verifies full remote and CDN bytes, and resumes from JSONL", async () => {
    const files = await fixture();
    const plan = await buildPlan(files);
    const remote = new Map();
    const storage = {
      async exists(key) { return remote.has(key); },
      async write(object) { remote.set(object.key, await readFile(object.filename)); },
      async digest(key) { const bytes = remote.get(key); return { sha256: sha256Bytes(bytes), byteSize: bytes.length }; },
    };
    const fetchImpl = async (url) => {
      const key = new URL(url).pathname.slice(1);
      const bytes = remote.get(key);
      return { ok: true, status: 200, async arrayBuffer() { return bytes; } };
    };
    const ledgerPath = path.join(files.root, "publisher.jsonl");
    const canary = await processObjects({ plan, objects: [plan.objects[0]], storage, ledgerPath, mode: "canary", fetchImpl });
    assert.equal(canary.uploaded, 1);
    assert.equal(hasCanaryCompletion(await readLedger(ledgerPath), plan.planDigest), true);
    const full = await processObjects({ plan, objects: plan.objects, storage, ledgerPath, mode: "full", fetchImpl });
    assert.equal(full.verified, 7);
    assert.equal((await readLedger(ledgerPath)).some((record) => record.type === "full-complete"), true);
    const resumed = await processObjects({ plan, objects: plan.objects, storage, ledgerPath, mode: "full", fetchImpl });
    assert.equal(resumed.resumed, 7);
  });
});
