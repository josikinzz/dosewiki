import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createUploadLedger, markBatchVerified } from "./run-local-r2-upload-batches.mjs";

const OPERATION = "upload-local-r2-media";
const script = fileURLToPath(new URL("./run-local-r2-upload-batches.mjs", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function writeFixture(root) {
  const sourceRoot = path.join(root, "source");
  const uploadRoot = path.join(root, "upload");
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(uploadRoot);
  const objects = [];
  const batches = [];
  for (const id of ["b1", "b2", "b3"]) {
    const key = `${id}.bin`;
    const content = `synthetic ${id}`;
    const localPath = path.join(sourceRoot, key);
    const stagedPath = path.join(uploadRoot, key);
    const filesFromPath = path.join(root, `files-${id}.txt`);
    fs.writeFileSync(localPath, content);
    fs.symlinkSync(localPath, stagedPath);
    fs.writeFileSync(filesFromPath, `${key}\n`);
    objects.push({ key, sha256: sha256(content), byteSize: content.length, contentType: "application/octet-stream", localPath, stagedPath });
    batches.push({ id, canary: id === "b1", objectCount: 1, byteSize: content.length, filesFromPath, keys: [key] });
  }
  const plan = {
    readyToUpload: true,
    remoteRoot: "replications-r2:replications",
    outputRoot: root,
    uploadRoot,
    summary: { batches: batches.length },
    uploadCanary: { keys: ["b1.bin"] },
    batches,
    objects,
  };
  const planPath = path.join(root, "plan.json");
  fs.writeFileSync(planPath, JSON.stringify(plan));
  const planSha256 = sha256(fs.readFileSync(planPath));

  const ledger = createUploadLedger(plan, { planPath, planSha256 });
  const results = markBatchVerified(ledger, plan, "b1", planSha256);
  Object.assign(ledger.batches.b2, { status: "failed", attempts: 1, error: "earlier synthetic failure" });
  const ledgerPath = path.join(root, "upload-ledger.json");
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger));
  fs.writeFileSync(path.join(root, "copy-results.jsonl"), results.map((result) => `${JSON.stringify(result)}\n`).join(""));

  const canary = objects[0];
  const publicVerificationPath = path.join(root, "public-verification.jsonl");
  fs.writeFileSync(publicVerificationPath, `${JSON.stringify({
    key: canary.key,
    plan_sha256: planSha256,
    sha256: canary.sha256,
    size: canary.byteSize,
    contentType: canary.contentType,
    delivery_headers: { content_type: canary.contentType, cache_control: "no-store", content_disposition: "inline", accept_ranges: "bytes" },
  })}\n`);

  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "rclone"), "#!/bin/sh\nprintf '%s\\n' \"$1\" >> \"$FAKE_RCLONE_LOG\"\n", { mode: 0o755 });

  const preloadPath = path.join(root, "freeze-on-source-read.mjs");
  fs.writeFileSync(preloadPath, [
    "import fs from \"node:fs\";",
    "const createReadStream = fs.createReadStream;",
    "fs.createReadStream = (...args) => {",
    "  process.env.DATA_WRITES_FROZEN = \"1\";",
    "  return createReadStream(...args);",
    "};",
  ].join("\n"));

  return { planPath, planSha256, ledgerPath, publicVerificationPath, bin, preloadPath, rcloneLog: path.join(root, "rclone.log") };
}

function runRemainingBatches(fixture, nodeArgs = []) {
  return spawnSync(process.execPath, [
    ...nodeArgs,
    script,
    "--plan", fixture.planPath,
    "--expected-plan-sha", fixture.planSha256,
    "--write",
    `--confirm-write=${OPERATION}`,
    `--confirm-plan=${fixture.planSha256}`,
    "--confirm-target=replications-r2:replications",
    "--confirm-bucket=replications",
    "--limit-batches=2",
    "--public-verification-results", fixture.publicVerificationPath,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATA_WRITES_FROZEN: "0",
      PATH: `${fixture.bin}${path.delimiter}${process.env.PATH}`,
      FAKE_RCLONE_LOG: fixture.rcloneLog,
    },
  });
}

describe("local R2 upload batches under the write freeze", () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "r2-upload-batches-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("copies and checks every remaining batch while writes are allowed", () => {
    const fixture = writeFixture(root);
    const run = runRemainingBatches(fixture);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.readFileSync(fixture.rcloneLog, "utf8"), "copy\ncheck\ncopy\ncheck\n");
    const ledger = JSON.parse(fs.readFileSync(fixture.ledgerPath, "utf8"));
    assert.deepEqual(
      Object.values(ledger.batches).map(({ id, status, attempts }) => [id, status, attempts]),
      [["b1", "verified", 0], ["b2", "verified", 2], ["b3", "verified", 1]],
    );
  });

  it("stops before any copy when the freeze activates during source validation", () => {
    const fixture = writeFixture(root);
    const ledgerBefore = fs.readFileSync(fixture.ledgerPath, "utf8");
    const run = runRemainingBatches(fixture, ["--import", pathToFileURL(fixture.preloadPath).href]);
    assert.equal(fs.existsSync(fixture.rcloneLog), false);
    assert.equal(fs.readFileSync(fixture.ledgerPath, "utf8"), ledgerBefore);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Data writes are frozen/);
  });
});
