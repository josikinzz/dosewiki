import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  digestValue,
  runProductionImport,
  validateDesiredInsert,
} from "./run-replication-index-production-import.mjs";

const SHA = "a".repeat(64);
const SECOND_SHA = "b".repeat(64);
const TEST_COMMIT = "4".repeat(40);

function desired(slug = "safe-item", sha = SHA) {
  return {
    expected_absent: true,
    slug,
    title: "Safe item",
    artist: "Reviewed Artist",
    role: "replication",
    type: "image",
    r2_key: `main/${sha}.webp`,
    thumbnail_r2_key: `thumb/${sha}.webp`,
    effect_slug: "geometry",
    width: 1200,
    height: 900,
    format: "webp",
    file_size: 1234,
    effect_tags: ["geometry"],
    source_sha256: sha,
    taxonomy: {
      taxonomy_record_key: `replication:${sha}`,
      replication_status: "replication",
      replication_status_confidence: "high",
      replication_status_review_required: false,
      viewing_mode: "closed-eye",
      viewing_mode_tags: ["closed-eye"],
      viewing_mode_confidence: "high",
      viewing_mode_review_required: false,
      content_family: "geometry",
      content_tags: ["geometry"],
      content_family_confidence: "high",
      content_family_review_required: false,
      taxonomy_review_required: false,
      taxonomy_version: 1,
      taxonomy_source_digest: SHA,
      taxonomy_updated_at: 1,
    },
    taxonomy_evidence: {
      operation_id: "replication-index-campaign-2026-08-31",
      replication_status_rationale: "Reviewed evidence.",
      viewing_mode_rationale: "Reviewed full image.",
      content_family_rationale: "Reviewed full image.",
    },
    rights_status: "creator-retained",
    credit_line: "Reviewed Artist",
    source_url: "https://example.com/source",
    rightsholder: "Reviewed Artist",
    removal_contact: "https://example.com/contact",
  };
}

function artifacts(root, { action = "create", blockers = [], commit = TEST_COMMIT, includeRemaining = false } = {}) {
  const insert = desired();
  const actionRow = {
    sha256: SHA,
    action,
    blockers,
    proposedSlug: insert.slug,
    desiredInsert: action === "create" ? insert : null,
    verification: { readBackBy: ["source_sha256", "slug"] },
  };
  const core = {
    schemaVersion: 1,
    artifactType: "replication-index-production-import-plan",
    operationId: "replication-index-campaign-2026-08-31",
    deployment: "prod:glad-minnow-656",
    target: "https://glad-minnow-656.convex.cloud",
    writeAuthorized: true,
    dryRunOnly: false,
    application: { commit },
    actions: [actionRow, ...(includeRemaining ? [{ ...actionRow, sha256: SECOND_SHA, proposedSlug: "second-item", desiredInsert: desired("second-item", SECOND_SHA) }] : [])],
  };
  const plan = { ...core, planDigestSha256: digestValue(core) };
  const canaryCore = {
    schemaVersion: 1,
    artifactType: "replication-index-production-canary",
    operationId: core.operationId,
    deployment: core.deployment,
    planDigestSha256: plan.planDigestSha256,
    writeAuthorized: true,
    items: [{ sha256: SHA, slug: insert.slug }],
    assertions: { heldShaCount: 0, blockedShaCount: 0, createOnly: true },
  };
  const canary = { ...canaryCore, canaryDigestSha256: digestValue(canaryCore) };
  const template = {
    schemaVersion: 1,
    artifactType: "replication-index-production-ledger-template",
    operationId: core.operationId,
    deployment: core.deployment,
    target: core.target,
    planDigestSha256: plan.planDigestSha256,
    applicationCommit: commit,
    items: {
      [SHA]: { action, status: "pending", eligibleForWrite: action === "create" },
      ...(includeRemaining ? { [SECOND_SHA]: { action: "create", status: "pending", eligibleForWrite: true } } : {}),
    },
  };
  const files = {
    plan: path.join(root, "plan.json"),
    canary: path.join(root, "canary.json"),
    template: path.join(root, "template.json"),
    ledger: path.join(root, "ledger.json"),
  };
  writeFileSync(files.plan, JSON.stringify(plan));
  writeFileSync(files.canary, JSON.stringify(canary));
  writeFileSync(files.template, JSON.stringify(template));
  return { files, plan, insert };
}

function argvFor(files, extra = []) {
  return ["--plan", files.plan, "--canary", files.canary, "--ledger-template", files.template, "--ledger", files.ledger, ...extra];
}

describe("replication index production import runner", () => {
  it("performs a zero-network dry run by default", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "replication-import-"));
    const { files } = artifacts(root);
    const clientFactory = vi.fn();
    const result = await runProductionImport({ argv: argvFor(files), env: {}, gitCommit: TEST_COMMIT, clientFactory, logger: { log() {} } });
    expect(result).toMatchObject({ mode: "dry-run", selected: 1, networkCalls: 0 });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("rejects non-create, held, or blocked canary rows", async () => {
    for (const fixture of [{ action: "hold" }, { action: "blocked", blockers: ["metadata"] }, { action: "create", blockers: ["hold"] }]) {
      const root = mkdtempSync(path.join(tmpdir(), "replication-import-"));
      const { files } = artifacts(root, fixture);
      await expect(runProductionImport({ argv: argvFor(files), env: {}, gitCommit: TEST_COMMIT, logger: { log() {} } })).rejects.toThrow(/create|blocked|hold/i);
    }
  });

  it("rejects payload drift and unknown desiredInsert fields", () => {
    expect(() => validateDesiredInsert({ ...desired(), surprise: true })).toThrow(/unsupported field/i);
    expect(() => validateDesiredInsert({ ...desired(), expected_absent: false })).toThrow(/expected_absent/i);
  });

  it("pins the application commit and explicit plan digest before writing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "replication-import-"));
    const { files, plan } = artifacts(root);
    await expect(runProductionImport({ argv: argvFor(files, ["--write"]), env: {}, gitCommit: "b".repeat(40), logger: { log() {} } })).rejects.toThrow(/application commit/i);
    await expect(runProductionImport({ argv: argvFor(files, ["--write", "--target-url", plan.target, "--expected-deployment", "glad-minnow-656", "--confirm-write", "replication-index-production-import", "--expected-plan-digest", "b".repeat(64), "--expected-application-commit", TEST_COMMIT]), env: {}, gitCommit: TEST_COMMIT, logger: { log() {} } })).rejects.toThrow(/expected-plan-digest/i);
    expect(plan.planDigestSha256).toHaveLength(64);
  });

  it("writes only the canary, reads it back, and records a verified nonsecret ledger", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "replication-import-"));
    const { files, plan, insert } = artifacts(root);
    const mutation = vi.fn().mockResolvedValue({ inserted: true, id: "row1", slug: insert.slug, role: "replication" });
    const query = vi.fn().mockResolvedValue({ _id: "row1", _creationTime: 1, ...insert, ...insert.taxonomy });
    const argv = argvFor(files, ["--write", "--phase", "canary", "--target-url", plan.target, "--expected-deployment", "glad-minnow-656", "--confirm-write", "replication-index-production-import", "--expected-plan-digest", plan.planDigestSha256, "--expected-application-commit", TEST_COMMIT]);
    const result = await runProductionImport({ argv, env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, gitCommit: TEST_COMMIT, clientFactory: () => ({ mutation, query }), logger: { log() {} } });
    expect(result).toMatchObject({ mode: "write", verified: 1 });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0][1].apiKey).toBe("secret");
    expect(typeof mutation.mock.calls[0][1].apiKey).toBe("string");
    expect(query).toHaveBeenCalledTimes(1);
    const ledgerText = readFileSync(files.ledger, "utf8");
    expect(ledgerText).not.toContain("secret");
    expect(JSON.parse(ledgerText).items[SHA].status).toBe("verified");
  });

  it("marks a post-dispatch failure uncertain and never retries it", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "replication-import-"));
    const { files, plan } = artifacts(root);
    const args = argvFor(files, ["--write", "--phase", "canary", "--target-url", plan.target, "--expected-deployment", "glad-minnow-656", "--confirm-write", "replication-index-production-import", "--expected-plan-digest", plan.planDigestSha256, "--expected-application-commit", TEST_COMMIT]);
    const clientFactory = () => ({ mutation: vi.fn().mockRejectedValue(new Error("timeout")), query: vi.fn() });
    await expect(runProductionImport({ argv: args, env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, gitCommit: TEST_COMMIT, clientFactory, logger: { log() {} } })).rejects.toThrow(/uncertain/i);
    expect(JSON.parse(readFileSync(files.ledger, "utf8")).items[SHA].status).toBe("uncertain");
    await expect(runProductionImport({ argv: args, env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, gitCommit: TEST_COMMIT, clientFactory, logger: { log() {} } })).rejects.toThrow(/uncertain/i);
  });

  it("stops and records uncertainty when read-back metadata drifts", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "replication-import-"));
    const { files, plan, insert } = artifacts(root);
    const args = argvFor(files, ["--write", "--phase", "canary", "--target-url", plan.target, "--expected-deployment", "glad-minnow-656", "--confirm-write", "replication-index-production-import", "--expected-plan-digest", plan.planDigestSha256, "--expected-application-commit", TEST_COMMIT]);
    const client = {
      mutation: vi.fn().mockResolvedValue({ inserted: true, id: "row1", slug: insert.slug, role: "replication" }),
      query: vi.fn().mockResolvedValue({ _id: "row1", _creationTime: 1, ...insert, ...insert.taxonomy, rights_status: "unknown" }),
    };
    await expect(runProductionImport({ argv: args, env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, gitCommit: TEST_COMMIT, clientFactory: () => client, logger: { log() {} } })).rejects.toThrow(/uncertain/i);
    expect(JSON.parse(readFileSync(files.ledger, "utf8")).items[SHA].status).toBe("uncertain");
  });

  it("blocks remaining work until canary verification and bounds the next batch", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "replication-import-"));
    const { files, plan, insert } = artifacts(root, { includeRemaining: true });
    await expect(runProductionImport({ argv: argvFor(files, ["--phase", "remaining", "--batch-size", "1"]), env: {}, gitCommit: TEST_COMMIT, logger: { log() {} } })).rejects.toThrow(/canary/i);
    const client = {
      mutation: vi.fn().mockResolvedValue({ inserted: true, id: "row1", slug: insert.slug, role: "replication" }),
      query: vi.fn().mockResolvedValue({ _id: "row1", _creationTime: 1, ...insert, ...insert.taxonomy }),
    };
    const writeArgs = argvFor(files, ["--write", "--phase", "canary", "--target-url", plan.target, "--expected-deployment", "glad-minnow-656", "--confirm-write", "replication-index-production-import", "--expected-plan-digest", plan.planDigestSha256, "--expected-application-commit", TEST_COMMIT]);
    await runProductionImport({ argv: writeArgs, env: { CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE: "secret" }, gitCommit: TEST_COMMIT, clientFactory: () => client, logger: { log() {} } });
    const result = await runProductionImport({ argv: argvFor(files, ["--phase", "remaining", "--batch-size", "1"]), env: {}, gitCommit: TEST_COMMIT, logger: { log() {} } });
    expect(result).toMatchObject({ mode: "dry-run", selected: 1, networkCalls: 0 });
  });
});
