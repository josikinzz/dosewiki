import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createBunR2Storage, createRcloneStorage } from "./publishSocialCardsToR2.mjs";
import { canonicalKey, installCandidateManifest, processObjects } from "./socialCardR2Pipeline.mjs";

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

  it("refuses the write when the freeze activates after the run starts", async () => {
    process.env.DATA_WRITES_FROZEN = "0";
    const storage = fakeStorage();
    const exists = storage.exists;
    storage.exists = async (key) => {
      process.env.DATA_WRITES_FROZEN = "1";
      return exists(key);
    };
    await assert.rejects(
      processObjects({ plan, objects: plan.objects, storage, ledgerPath: path.join(dir, "ledger.jsonl"), mode: "canary-apply" }),
      { code: "DATA_WRITES_FROZEN" },
    );
    assert.deepEqual(storage.calls, [["exists", object.key]]);
  });

  async function installFixture() {
    const paths = {
      plan,
      targetPath: path.join(dir, "target.json"),
      candidatePath: path.join(dir, "candidate.json"),
      rollbackPath: path.join(dir, "rollback.json"),
      publisherLedgerPath: path.join(dir, "publisher.jsonl"),
      verificationLedgerPath: path.join(dir, "verification.jsonl"),
    };
    await writeFile(paths.targetPath, "{\"cards\":{}}\n");
    await writeFile(paths.candidatePath, JSON.stringify({ cards: { a: 1 }, promotion: { planDigest: plan.planDigest } }));
    await writeFile(paths.publisherLedgerPath, `${JSON.stringify({ type: "full-complete", planDigest: plan.planDigest, objectCount: 1 })}\n`);
    await writeFile(
      paths.verificationLedgerPath,
      [
        { type: "object-verification-complete", planDigest: plan.planDigest, runId: "run-1", exhaustive: true, objectCount: 1 },
        { type: "object-verified", planDigest: plan.planDigest, runId: "run-1", key: object.key, sha256, size: 3 },
      ].map((record) => `${JSON.stringify(record)}\n`).join(""),
    );
    return paths;
  }

  it("installs a fully verified candidate once writes are allowed", async () => {
    process.env.DATA_WRITES_FROZEN = "0";
    const fixture = await installFixture();
    await installCandidateManifest(fixture);
    assert.match(await readFile(fixture.targetPath, "utf8"), /"a":1/);
    assert.equal(await readFile(fixture.rollbackPath, "utf8"), "{\"cards\":{}}\n");
  });

  it("refuses manifest replacement when the freeze activates during validation", async () => {
    process.env.DATA_WRITES_FROZEN = "0";
    const fixture = await installFixture();
    const realStat = fsPromises.stat;
    fsPromises.stat = async (target, ...rest) => {
      if (target === fixture.rollbackPath) process.env.DATA_WRITES_FROZEN = "1";
      return realStat(target, ...rest);
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(installCandidateManifest(fixture), { code: "DATA_WRITES_FROZEN" });
    } finally {
      fsPromises.stat = realStat;
      syncBuiltinESMExports();
    }
    assert.equal(process.env.DATA_WRITES_FROZEN, "1");
    assert.equal(await readFile(fixture.targetPath, "utf8"), "{\"cards\":{}}\n");
    await assert.rejects(stat(fixture.rollbackPath), { code: "ENOENT" });
  });

  async function installFreezingAfter(fsName, freezesAfter) {
    process.env.DATA_WRITES_FROZEN = "0";
    const fixture = await installFixture();
    const real = fsPromises[fsName];
    fsPromises[fsName] = async (...args) => {
      const result = await real(...args);
      if (freezesAfter(fixture, ...args)) process.env.DATA_WRITES_FROZEN = "1";
      return result;
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(installCandidateManifest(fixture), { code: "DATA_WRITES_FROZEN" });
    } finally {
      fsPromises[fsName] = real;
      syncBuiltinESMExports();
    }
    assert.equal(process.env.DATA_WRITES_FROZEN, "1");
    assert.equal(await readFile(fixture.targetPath, "utf8"), "{\"cards\":{}}\n");
    assert.equal(await readFile(fixture.rollbackPath, "utf8"), "{\"cards\":{}}\n");
    const ledgerTypes = (await readFile(fixture.publisherLedgerPath, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line).type);
    assert.deepEqual(ledgerTypes, ["full-complete"]);
  }

  it("refuses manifest replacement when the freeze activates after the rollback snapshot is installed", async () => {
    await installFreezingAfter("rename", (fixture, _from, to) => to === path.resolve(fixture.rollbackPath));
  });

  it("refuses manifest replacement when the freeze activates after the target is staged", async () => {
    await installFreezingAfter("writeFile", (fixture, filename) => String(filename).startsWith(`${path.resolve(fixture.targetPath)}.`));
  });

  async function bunAdapterWrites() {
    const writes = [];
    const previousBun = globalThis.Bun;
    globalThis.Bun = {
      S3Client: class {
        file(key) {
          return { write: async () => writes.push(key) };
        }
      },
      file: (filename) => ({ filename }),
    };
    try {
      return { writes, result: await createBunR2Storage({}).write(object).then(() => "written", (error) => error) };
    } finally {
      if (previousBun === undefined) delete globalThis.Bun;
      else globalThis.Bun = previousBun;
    }
  }

  it("refuses a frozen write through the Bun S3 adapter", async () => {
    const { writes, result } = await bunAdapterWrites();
    assert.equal(result.code, "DATA_WRITES_FROZEN");
    assert.deepEqual(writes, []);
    process.env.DATA_WRITES_FROZEN = "0";
    assert.deepEqual(await bunAdapterWrites(), { writes: [object.key], result: "written" });
  });

  it("refuses a frozen write through the rclone adapter", async () => {
    const bin = path.join(dir, "bin");
    const log = path.join(dir, "rclone.log");
    await mkdir(bin);
    await writeFile(path.join(bin, "rclone"), "#!/bin/sh\nprintf '%s\\n' \"$1\" >> \"$FAKE_RCLONE_LOG\"\n");
    await chmod(path.join(bin, "rclone"), 0o755);
    const previousPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${previousPath}`;
    process.env.FAKE_RCLONE_LOG = log;
    try {
      const storage = createRcloneStorage("replications-r2:replications");
      await assert.rejects(storage.write(object), { code: "DATA_WRITES_FROZEN" });
      await assert.rejects(stat(log), { code: "ENOENT" });
      process.env.DATA_WRITES_FROZEN = "0";
      await storage.write(object);
      assert.equal(await readFile(log, "utf8"), "copyto\n");
    } finally {
      process.env.PATH = previousPath;
      delete process.env.FAKE_RCLONE_LOG;
    }
  });
});
