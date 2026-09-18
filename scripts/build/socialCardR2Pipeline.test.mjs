import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlan,
  hasCompletedCanary,
  installCandidateManifest,
  processObjects,
  readJsonLines,
  selectCanaryObjects,
  sha256Bytes,
  writeCandidateManifest,
} from "./socialCardR2Pipeline.mjs";
import { parseRcloneObjectStat, requireApplyConfirmation, rcloneObject } from "./publishSocialCardsToR2.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "social-card-r2-"));
  const assets = path.join(root, "assets");
  await mkdir(path.join(assets, "replications"), { recursive: true });
  await mkdir(path.join(assets, "contributors"), { recursive: true });
  await writeFile(path.join(assets, "replications", "a.jpg"), "same-card");
  await writeFile(path.join(assets, "replications", "b.jpg"), "same-card");
  await writeFile(path.join(assets, "contributors", "artist.jpg"), "artist-card");
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    version: 1,
    cards: {
      replications: {
        a: "/local/social-cards/replications/a.jpg",
        b: "/local/social-cards/replications/b.jpg",
      },
      contributors: { artist: "/local/social-cards/contributors/artist.jpg" },
    },
  }, null, 2)}\n`);
  return { root, assets, manifestPath };
}

describe("social-card R2 publication plan", () => {
  it("requires explicit apply plus exact target and bucket confirmations", () => {
    const valid = [
      "--apply",
      "--confirm-operation=publish-social-cards",
      "--confirm-plan=abc",
      "--confirm-target=replications-r2:",
      "--confirm-bucket=replications",
    ];
    assert.doesNotThrow(() => requireApplyConfirmation(valid, "replications-r2:", "replications", "abc"));
    assert.throws(() => requireApplyConfirmation(valid.filter((arg) => arg !== "--apply"), "replications-r2:", "replications", "abc"), /--apply/);
    assert.throws(() => requireApplyConfirmation(valid.with(2, "--confirm-plan=wrong"), "replications-r2:", "replications", "abc"), /confirm-plan/);
    assert.throws(() => requireApplyConfirmation(valid.with(3, "--confirm-target=other:"), "replications-r2:", "replications", "abc"), /confirm-target/);
    assert.throws(() => requireApplyConfirmation(valid.with(4, "--confirm-bucket=other"), "replications-r2:", "replications", "abc"), /confirm-bucket/);
  });

  it("carries an already-published CDN card through the plan without an object to upload", async () => {
    const { root, assets } = await fixture();
    const publishedSha = "f".repeat(64);
    const publishedUrl = `https://cdn.test/media/sha256/ff/${publishedSha}.jpg`;
    const manifestPath = path.join(root, "mixed.json");
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      cards: {
        replications: { a: "/local/social-cards/replications/a.jpg", old: publishedUrl },
      },
    }));
    const plan = await buildPlan({ manifestPath, assetsRoot: assets, cdnBase: "https://cdn.test/" });
    assert.equal(plan.objects.length, 1);
    assert.equal(plan.logicalCards.length, 2);
    const old = plan.logicalCards.find((card) => card.slug === "old");
    assert.equal(old.published, true);
    assert.equal(old.sha256, publishedSha);
    assert.equal(plan.candidateManifest.cards.replications.old, publishedUrl);
    assert.equal(plan.candidateManifest.promotion.publishedCardCount, 1);
    // A digest URL on some other host is not "already published" here.
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      cards: { replications: { old: `https://elsewhere.test/media/sha256/ff/${publishedSha}.jpg` } },
    }));
    await assert.rejects(buildPlan({ manifestPath, assetsRoot: assets, cdnBase: "https://cdn.test" }), /Unsupported social-card path/);
  });

  it("anchors rclone operations beneath an explicit bucket path", () => {
    assert.equal(
      rcloneObject("replications-r2:replications", "media/sha256/aa/hash.jpg"),
      "replications-r2:replications/media/sha256/aa/hash.jpg",
    );
    assert.throws(() => rcloneObject("replications-r2:", "media/sha256/aa/hash.jpg"), /account root/);
    assert.throws(() => rcloneObject("replications-r2:replications/../other", "media/sha256/aa/hash.jpg"), /Unsafe/);
    assert.equal(parseRcloneObjectStat("null\n", "key"), false);
    assert.equal(parseRcloneObjectStat('{"Size":42,"IsDir":false}\n', "key"), true);
    assert.throws(() => parseRcloneObjectStat("{}", "key"), /invalid object metadata/);
  });

  it("accepts the explicit campaign layout, deduplicates by bytes, and emits immutable URLs", async () => {
    const files = await fixture();
    const plan = await buildPlan({ manifestPath: files.manifestPath, assetsRoot: files.assets, concurrency: 2 });
    assert.equal(plan.logicalCards.length, 3);
    assert.equal(plan.objects.length, 2);
    assert.match(plan.candidateManifest.cards.replications.a, /^https:\/\/dosewiki-media\.gremblinzuwu\.workers\.dev\/media\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.jpg$/);
    assert.equal(plan.candidateManifest.cards.replications.a, plan.candidateManifest.cards.replications.b);
    assert.equal(plan.candidateManifest.promotion.planDigest, plan.planDigest);
  });

  it("hard-fails an existing immutable-key collision without writing", async () => {
    const files = await fixture();
    const plan = await buildPlan({ manifestPath: files.manifestPath, assetsRoot: files.assets });
    let writes = 0;
    const storage = {
      exists: async () => true,
      digest: async () => ({ sha256: "0".repeat(64), size: 9 }),
      write: async () => { writes += 1; },
    };
    const ledger = path.join(files.root, "collision.jsonl");
    await assert.rejects(processObjects({ plan, objects: [plan.objects[0]], storage, ledgerPath: ledger, mode: "canary-apply", concurrency: 1 }), /IMMUTABLE COLLISION/);
    assert.equal(writes, 0);
    assert.equal((await readJsonLines(ledger)).some((record) => record.status === "collision"), true);
  });

  it("uploads canaries once, verifies readback, and resumes from its append-only ledger", async () => {
    const files = await fixture();
    const plan = await buildPlan({ manifestPath: files.manifestPath, assetsRoot: files.assets });
    const bytesByKey = new Map();
    let writes = 0;
    const storage = {
      exists: async (key) => bytesByKey.has(key),
      digest: async (key) => {
        const bytes = bytesByKey.get(key);
        return { sha256: sha256Bytes(bytes), size: bytes.length };
      },
      write: async (object) => {
        writes += 1;
        bytesByKey.set(object.key, await readFile(object.filename));
      },
    };
    const ledger = path.join(files.root, "publisher.jsonl");
    const canaries = selectCanaryObjects(plan, ["replications:a", { category: "contributors", slug: "artist" }]);
    const first = await processObjects({ plan, objects: canaries, storage, ledgerPath: ledger, mode: "canary-apply", concurrency: 2 });
    assert.equal(first.uploaded, 2);
    assert.equal(hasCompletedCanary(await readJsonLines(ledger), plan.planDigest), true);
    const second = await processObjects({ plan, objects: canaries, storage, ledgerPath: ledger, mode: "canary-apply", concurrency: 2 });
    assert.equal(second.resumed, 2);
    assert.equal(writes, 2);
  });

  it("resumes both exact-reuse and absent results in a read-only preflight", async () => {
    const files = await fixture();
    const plan = await buildPlan({ manifestPath: files.manifestPath, assetsRoot: files.assets });
    const exact = await readFile(plan.objects[0].filename);
    const storage = {
      exists: async (key) => key === plan.objects[0].key,
      digest: async () => ({ sha256: sha256Bytes(exact), size: exact.length }),
      write: async () => { throw new Error("preflight must not write"); },
    };
    const ledger = path.join(files.root, "preflight.jsonl");
    const first = await processObjects({ plan, objects: plan.objects, storage, ledgerPath: ledger, mode: "preflight", concurrency: 2 });
    assert.equal(first.reused, 1);
    assert.equal(first.absent, 1);
    const second = await processObjects({
      plan,
      objects: plan.objects,
      storage: { exists: async () => { throw new Error("resumed entries must not probe remote"); } },
      ledgerPath: ledger,
      mode: "preflight",
      concurrency: 2,
    });
    assert.equal(second.reused, 1);
    assert.equal(second.absent, 1);
    assert.equal(second.resumed, 2);
  });

  it("installs after exhaustive object verification and preserves a rollback manifest", async () => {
    const files = await fixture();
    const plan = await buildPlan({ manifestPath: files.manifestPath, assetsRoot: files.assets });
    const candidate = path.join(files.root, "candidate.json");
    const target = path.join(files.root, "target.json");
    const rollback = path.join(files.root, "rollback.json");
    const publisherLedger = path.join(files.root, "publisher.jsonl");
    const verificationLedger = path.join(files.root, "verification.jsonl");
    const prior = '{"cards":{"old":true}}\n';
    await writeCandidateManifest(candidate, plan);
    await writeFile(target, prior);
    await writeFile(publisherLedger, `${JSON.stringify({ type: "full-complete", planDigest: plan.planDigest, objectCount: plan.objects.length })}\n`);
    const completion = {
      type: "object-verification-complete",
      planDigest: plan.planDigest,
      runId: "predeploy-objects",
      objectCount: plan.objects.length,
      totalBytes: plan.totalBytes,
      exhaustive: true,
    };
    // A completion record alone proves nothing about this plan's objects.
    await writeFile(verificationLedger, `${JSON.stringify(completion)}\n`);
    await assert.rejects(installCandidateManifest({ plan, candidatePath: candidate, targetPath: target, rollbackPath: rollback, publisherLedgerPath: publisherLedger, verificationLedgerPath: verificationLedger }), /object verification/);
    await writeFile(verificationLedger, [
      ...plan.objects.map((object) => JSON.stringify({ type: "object-verified", planDigest: plan.planDigest, runId: "predeploy-objects", key: object.key, sha256: object.sha256, size: object.size })),
      JSON.stringify(completion),
    ].map((line) => `${line}\n`).join(""));
    await installCandidateManifest({
      plan,
      candidatePath: candidate,
      targetPath: target,
      rollbackPath: rollback,
      publisherLedgerPath: publisherLedger,
      verificationLedgerPath: verificationLedger,
    });
    assert.equal(await readFile(rollback, "utf8"), prior);
    assert.equal(JSON.parse(await readFile(target, "utf8")).promotion.planDigest, plan.planDigest);
  });

  it("refuses install when only post-deployment route verification is present", async () => {
    const files = await fixture();
    const plan = await buildPlan({ manifestPath: files.manifestPath, assetsRoot: files.assets });
    const candidate = path.join(files.root, "candidate.json");
    const target = path.join(files.root, "target.json");
    const rollback = path.join(files.root, "rollback.json");
    const publisherLedger = path.join(files.root, "publisher.jsonl");
    const verificationLedger = path.join(files.root, "verification.jsonl");
    await writeCandidateManifest(candidate, plan);
    await writeFile(target, "{}\n");
    await writeFile(publisherLedger, `${JSON.stringify({ type: "full-complete", planDigest: plan.planDigest, objectCount: plan.objects.length })}\n`);
    await writeFile(verificationLedger, `${JSON.stringify({ type: "verification-complete", planDigest: plan.planDigest, objectCount: plan.objects.length, exhaustive: true })}\n`);
    await assert.rejects(installCandidateManifest({ plan, candidatePath: candidate, targetPath: target, rollbackPath: rollback, publisherLedgerPath: publisherLedger, verificationLedgerPath: verificationLedger }), /object verification/);
  });
});
