import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildLocalR2UploadPlan,
  verifyLocalObjects,
  writeUploadPlan,
} from "./build-local-r2-upload-plan.mjs";

const roots = [];

const digest = (value) => createHash("sha256").update(value).digest("hex");

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r2-upload-plan-"));
  roots.push(outputRoot);
  const makeItem = (content, extension, role) => {
    const sha = digest(content);
    const relative = `media/sha256/${sha.slice(0, 2)}/${sha}.${extension}`;
    const outputPath = path.join(outputRoot, relative);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);
    return {
      sourceSha256: "ef".padEnd(64, "2"),
      role,
      status: "completed",
      outputPath,
      outputSha256: sha,
      r2Key: relative,
      byteSize: fs.statSync(outputPath).size,
      extension,
    };
  };
  return {
    outputRoot,
    ledger: {
      outputRoot,
      items: {
        a: makeItem("image", "webp", "static_display"),
        b: makeItem("image", "webp", "static_thumbnail"),
        c: makeItem("video", "mp4", "video_main"),
        d: {
          sourceSha256: "12".padEnd(64, "3"),
          role: "video_poster",
          status: "blocked",
          reason: "technical publication block: technical-decode-failure",
          publicationBlockers: ["technical-decode-failure"],
        },
      },
    },
  };
}

function optionsFor(ledger, overrides = {}) {
  return {
    ledgerPath: "/tmp/retry4.json",
    ledgerSha256: "11".repeat(32),
    expectedRoleCount: Object.keys(ledger.items).length,
    expectedTechnicalBlocks: Object.values(ledger.items).filter((item) => item.status === "blocked").map((item) => `${item.sourceSha256}:${item.role}`),
    requiredCanaryCoverage: ["type:webp", "type:mp4", "status:completed"],
    ...overrides,
  };
}

describe("buildLocalR2UploadPlan", () => {
  it("deduplicates content-addressed objects while retaining every covered role", () => {
    const { ledger, outputRoot } = fixture();
    const plan = buildLocalR2UploadPlan(ledger, optionsFor(ledger, { batchSize: 1 }));

    expect(plan.readyToUpload).toBe(true);
    expect(plan.outputRoot).toBe(outputRoot);
    expect(plan.summary).toMatchObject({ roles: 4, uploadRoles: 3, uniqueObjects: 2, blockedRoles: 1, plannedRoles: 0 });
    expect(plan.objects.find((object) => object.coveredRoles.length === 2)?.coveredRoles).toHaveLength(2);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0].canary).toBe(true);
    expect(plan.productionWrites).toBe(0);
  });

  it("fails closed when any role is still planned or a key is not canonical", () => {
    const { ledger } = fixture();
    ledger.items.pending = { sourceSha256: "34".padEnd(64, "5"), role: "video_preview", status: "planned" };
    expect(buildLocalR2UploadPlan(ledger, optionsFor(ledger)).readyToUpload).toBe(false);

    ledger.items.a.r2Key = "wrong/key.webp";
    expect(() => buildLocalR2UploadPlan(ledger, optionsFor(ledger))).toThrow(/canonical R2 key/);
  });

  it("normalizes an immutable reused source into an upload object", () => {
    const { ledger } = fixture();
    const sourcePath = path.join(ledger.outputRoot, "..", "archive-source.gif");
    fs.writeFileSync(sourcePath, "gif-source");
    const sha = digest("gif-source");
    ledger.items.reused = {
      sourceSha256: sha,
      role: "gif_original",
      status: "reused",
      extension: "gif",
      sourcePath,
      outputPath: sourcePath,
      sourceBefore: { byteSize: fs.statSync(sourcePath).size },
      r2Key: `media/sha256/${sha.slice(0, 2)}/${sha}.gif`,
    };
    const plan = buildLocalR2UploadPlan(ledger, optionsFor(ledger, {
      requiredCanaryCoverage: ["type:gif", "type:mp4", "type:webp", "status:completed", "status:reused"],
    }));
    expect(plan.objects.find((object) => object.sha256 === sha)).toMatchObject({
      localPath: sourcePath,
      byteSize: fs.statSync(sourcePath).size,
      contentType: "image/gif",
    });
    expect(plan.uploadCanary.complete).toBe(true);
  });

  it("writes a JSON plan, object manifest, and deterministic files-from batches", async () => {
    const { ledger } = fixture();
    const plan = buildLocalR2UploadPlan(ledger, optionsFor(ledger, { batchSize: 1 }));
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), "r2-upload-artifacts-"));
    roots.push(destination);

    await verifyLocalObjects(plan, { concurrency: 2 });
    const written = writeUploadPlan(plan, { destination });
    expect(JSON.parse(fs.readFileSync(written.planPath, "utf8")).summary.uniqueObjects).toBe(2);
    expect(fs.readFileSync(written.manifestPath, "utf8").trim().split("\n")).toHaveLength(2);
    expect(written.batchFiles).toHaveLength(1);
    expect(fs.readFileSync(written.batchFiles[0], "utf8")).toMatch(/^media\/sha256\//);
    expect(fs.lstatSync(JSON.parse(fs.readFileSync(written.planPath, "utf8")).objects[0].stagedPath).isSymbolicLink()).toBe(true);
  });

  it("streams every unique local object through SHA-256 verification before staging", async () => {
    const { ledger } = fixture();
    const plan = buildLocalR2UploadPlan(ledger, optionsFor(ledger));
    await expect(verifyLocalObjects(plan, { concurrency: 2 })).resolves.toMatchObject({ valid: true, verifiedObjects: 2 });
    fs.appendFileSync(plan.objects[0].localPath, "tamper");
    await expect(verifyLocalObjects(plan, { concurrency: 2 })).rejects.toThrow(/size mismatch|SHA-256 mismatch/);
  });
});
