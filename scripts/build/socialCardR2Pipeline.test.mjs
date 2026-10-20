import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { requireApplyConfirmation } from "./publishSocialCardsToR2.mjs";
import { canonicalKey, installCandidateManifest, processObjects } from "./socialCardR2Pipeline.mjs";

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
});

describe("social-card R2 publication under the write freeze", () => {
  const sha256 = "a".repeat(64);
  const object = { key: canonicalKey(sha256), sha256, size: 3, filename: "card.jpg" };
  const plan = { planDigest: "plan-1", objects: [object] };
  let dir;
  let previousFreeze;

  function fakeStorage() {
    const calls = [];
    return {
      calls,
      async exists(key) {
        calls.push(["exists", key]);
        return false;
      },
      async digest(key) {
        calls.push(["digest", key]);
        return { sha256, size: 3 };
      },
      async write(written) {
        calls.push(["write", written.key]);
      },
    };
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "social-card-freeze-"));
    previousFreeze = process.env.DATA_WRITES_FROZEN;
    process.env.DATA_WRITES_FROZEN = "1";
  });

  afterEach(async () => {
    if (previousFreeze === undefined) delete process.env.DATA_WRITES_FROZEN;
    else process.env.DATA_WRITES_FROZEN = previousFreeze;
    await rm(dir, { recursive: true, force: true });
  });

  for (const mode of ["canary-apply", "full-apply"]) {
    it(`refuses ${mode} before touching storage or the ledger`, async () => {
      const storage = fakeStorage();
      const ledgerPath = path.join(dir, "ledger.jsonl");
      await assert.rejects(processObjects({ plan, objects: plan.objects, storage, ledgerPath, mode }), { code: "DATA_WRITES_FROZEN" });
      assert.deepEqual(storage.calls, []);
      await assert.rejects(stat(ledgerPath), { code: "ENOENT" });
    });
  }

  it("keeps read-only preflight available", async () => {
    const storage = fakeStorage();
    const summary = await processObjects({ plan, objects: plan.objects, storage, ledgerPath: path.join(dir, "ledger.jsonl"), mode: "preflight" });
    assert.equal(summary.absent, 1);
    assert.deepEqual(storage.calls, [["exists", object.key]]);
  });

  it("uploads once writes are allowed", async () => {
    process.env.DATA_WRITES_FROZEN = "0";
    const storage = fakeStorage();
    const summary = await processObjects({ plan, objects: plan.objects, storage, ledgerPath: path.join(dir, "ledger.jsonl"), mode: "canary-apply" });
    assert.equal(summary.uploaded, 1);
    assert.ok(storage.calls.some(([call]) => call === "write"));
  });

  it("refuses to replace the installed manifest", async () => {
    const targetPath = path.join(dir, "target.json");
    const candidatePath = path.join(dir, "candidate.json");
    const rollbackPath = path.join(dir, "rollback.json");
    await writeFile(targetPath, "{\"cards\":{}}\n");
    await writeFile(candidatePath, JSON.stringify({ cards: {}, promotion: { planDigest: plan.planDigest } }));
    await assert.rejects(
      installCandidateManifest({
        plan,
        candidatePath,
        targetPath,
        rollbackPath,
        publisherLedgerPath: path.join(dir, "publisher.jsonl"),
        verificationLedgerPath: path.join(dir, "verification.jsonl"),
      }),
      { code: "DATA_WRITES_FROZEN" },
    );
    assert.equal(await readFile(targetPath, "utf8"), "{\"cards\":{}}\n");
    await assert.rejects(stat(rollbackPath), { code: "ENOENT" });
  });
});
