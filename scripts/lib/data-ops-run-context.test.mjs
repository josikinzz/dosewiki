import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertDataOpsWriteAllowed,
  backupBeforeWrite,
  batchAndApplyMutations,
  createDataOpsRunContext,
  findRepoRoot,
  getAdminIntentEnvVar,
  loadEnvFiles,
  parseEnvFileContent,
  requireAdminIntentToken,
  resolveAdminIntentToken,
  updateAuditLog,
  writeAuditLog,
} from "./data-ops-run-context.mjs";

const tmpRoots = [];

async function makeTmpRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-data-ops-"));
  tmpRoots.push(root);
  await writeFile(path.join(root, "package.json"), "{}\n");
  await mkdir(path.join(root, "scripts", "convex"), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("data ops run context", () => {
  it("parses .env.local values without overriding process environment", async () => {
    const root = await makeTmpRepo();
    await writeFile(
      path.join(root, ".env.local"),
      [
        "# local development",
        "VITE_CONVEX_URL=https://dev.convex.cloud",
        "export NEXT_PUBLIC_CONVEX_URL='https://public.convex.cloud'",
        "CONVEX_ADMIN_KEY=\"local-secret\"",
      ].join("\n"),
    );

    const env = { VITE_CONVEX_URL: "https://shell.convex.cloud" };
    const loaded = loadEnvFiles({ rootDir: root, env });

    expect(loaded[".env.local"].CONVEX_ADMIN_KEY).toBe("local-secret");
    expect(env.VITE_CONVEX_URL).toBe("https://shell.convex.cloud");
    expect(env.NEXT_PUBLIC_CONVEX_URL).toBe("https://public.convex.cloud");
    expect(env.CONVEX_ADMIN_KEY).toBe("local-secret");
  });

  it("resolves repo root from a nested script directory", async () => {
    const root = await makeTmpRepo();
    const nested = path.join(root, "scripts", "convex");

    expect(findRepoRoot(nested)).toBe(root);
  });

  it("uses explicit source and target variables before public fallbacks", () => {
    const context = createDataOpsRunContext({
      operation: "copy",
      intent: "cross-deployment-copy",
      argv: [],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://source.convex.cloud",
        TARGET_CONVEX_URL: "https://target.convex.cloud",
        VITE_CONVEX_URL: "https://dev.convex.cloud",
      },
    });

    expect(context.sourceUrl).toBe("https://source.convex.cloud");
    expect(context.sourceUrlKey).toBe("SOURCE_CONVEX_URL");
    expect(context.targetUrl).toBe("https://target.convex.cloud");
    expect(context.targetUrlKey).toBe("TARGET_CONVEX_URL");
  });

  it("blocks dry-run writes through the shared policy", () => {
    const context = createDataOpsRunContext({
      operation: "local prepopulate",
      intent: "local-prepopulate",
      argv: ["--dry-run"],
      loadsEnvLocal: false,
      env: { VITE_CONVEX_URL: "https://dev.convex.cloud" },
      sourceUrlKeys: [],
      targetUrlKeys: [],
      localArtifacts: ["src/data/SubstanceIndex.json"],
    });

    expect(context.sourceUrl).toBeNull();
    expect(context.targetUrl).toBeNull();
    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/dry-run mode/);
  });

  it("requires destructive production confirmation before writes", () => {
    const context = createDataOpsRunContext({
      operation: "production sync",
      intent: "production-sync",
      argv: ["--tables=prompts", "--write"],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://dev.convex.cloud",
        TARGET_CONVEX_URL: "https://prod.convex.cloud",
      },
      selectedTables: ["prompts"],
      confirmationFlag: "--confirm-production-sync",
      destructive: true,
    });

    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/--confirm-production-sync/);
  });

  it("allows confirmed destructive writes and reports selected tables", () => {
    const context = createDataOpsRunContext({
      operation: "production sync",
      intent: "production-sync",
      argv: [
        "--tables=prompts",
        "--write",
        "--confirm-production-sync",
        "--confirm-write=production-sync",
        "--expected-deployment=prod",
      ],
      loadsEnvLocal: false,
      env: {
        SOURCE_CONVEX_URL: "https://dev.convex.cloud",
        TARGET_CONVEX_URL: "https://prod.convex.cloud",
      },
      selectedTables: ["prompts"],
      confirmationFlag: "--confirm-production-sync",
      destructive: true,
    });

    expect(() => assertDataOpsWriteAllowed(context)).not.toThrow();
    expect(context.selectedTables).toEqual(["prompts"]);
  });

  it("requires the common operation phrase and deployment fingerprint", () => {
    const base = {
      operation: "production sync",
      intent: "production-sync",
      loadsEnvLocal: false,
      env: { TARGET_CONVEX_URL: "https://prod.convex.cloud" },
    };

    const missingPhrase = createDataOpsRunContext({ ...base, argv: ["--write"] });
    expect(() => assertDataOpsWriteAllowed(missingPhrase)).toThrow(
      /--confirm-write=production-sync/,
    );

    const missingFingerprint = createDataOpsRunContext({
      ...base,
      argv: ["--write", "--confirm-write=production-sync"],
    });
    expect(() => assertDataOpsWriteAllowed(missingFingerprint)).toThrow(
      /--expected-deployment=prod/,
    );
  });

  it("rejects browser-derived privileged targets", () => {
    const context = createDataOpsRunContext({
      operation: "production sync",
      intent: "production-sync",
      argv: [
        "--write",
        "--confirm-write=production-sync",
        "--expected-deployment=dev",
      ],
      loadsEnvLocal: false,
      env: { VITE_CONVEX_URL: "https://dev.convex.cloud" },
    });

    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/TARGET_CONVEX_URL/);
  });

  it("allows an explicitly opted-in loopback write with execute and write flags", () => {
    const context = createDataOpsRunContext({
      operation: "local replication import",
      intent: "dev-convex-import",
      argv: ["--execute", "--write"],
      loadsEnvLocal: false,
      env: {},
      defaultTargetUrl: "http://localhost:3210",
      requiresExecute: true,
      allowLocalTarget: true,
    });

    expect(context.targetIsLocal).toBe(true);
    expect(() => assertDataOpsWriteAllowed(context)).not.toThrow();
  });

  it("allows an explicitly opted-in bracketed IPv6 loopback write", () => {
    const context = createDataOpsRunContext({
      operation: "local replication import",
      intent: "dev-convex-import",
      argv: ["--execute", "--write"],
      loadsEnvLocal: false,
      env: {},
      defaultTargetUrl: "http://[::1]:3210",
      requiresExecute: true,
      allowLocalTarget: true,
    });

    expect(context.targetIsLocal).toBe(true);
    expect(context.deploymentFingerprint).toBeNull();
    expect(() => assertDataOpsWriteAllowed(context)).not.toThrow();
  });

  it("rejects loopback writes unless the command explicitly opts in", () => {
    const context = createDataOpsRunContext({
      operation: "local replication import",
      intent: "dev-convex-import",
      argv: ["--execute", "--write"],
      loadsEnvLocal: false,
      env: {},
      defaultTargetUrl: "http://127.0.0.1:3210",
      requiresExecute: true,
    });

    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/allowLocalTarget/);
  });

  it("rejects non-loopback HTTP targets even when local writes are allowed", () => {
    expect(() => createDataOpsRunContext({
      operation: "local replication import",
      intent: "dev-convex-import",
      argv: ["--execute", "--write"],
      loadsEnvLocal: false,
      env: { TARGET_CONVEX_URL: "http://192.168.1.20:3210" },
      requiresExecute: true,
      allowLocalTarget: true,
    })).toThrow(/HTTPS .convex.cloud/);
  });

  it("parses bare env content", () => {
    expect(parseEnvFileContent("A=1\nexport B='two'\n# nope\nC=\"three\"\n")).toEqual({
      A: "1",
      B: "two",
      C: "three",
    });
  });

  it("prefers scoped admin intent tokens before the legacy admin key", () => {
    expect(getAdminIntentEnvVar("citationEvidenceWrite")).toBe("CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE");

    expect(resolveAdminIntentToken("citationEvidenceWrite", {
      env: {
        CONVEX_ADMIN_KEY: "legacy-secret",
        CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE: "citation-secret",
      },
    })).toEqual({
      token: "citation-secret",
      source: "scoped",
      envVar: "CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE",
    });
  });

  it.each([
    ["editorArticleWrite", "CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE"],
    ["promptMigrationWrite", "CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE"],
    ["profileMediaWrite", "CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE"],
    ["quoteMigrationWrite", "CONVEX_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE"],
  ])("prefers %s scoped credentials over the master key", (intent, envVar) => {
    expect(requireAdminIntentToken(intent, {
      env: {
        CONVEX_ADMIN_KEY: "master-key",
        [envVar]: "scoped-key",
      },
    })).toMatchObject({ token: "scoped-key", source: "scoped", envVar });
  });

  it("falls back to the legacy admin key for admin intents when no scoped token exists", () => {
    expect(requireAdminIntentToken("citationEvidenceReview", {
      env: {
        CONVEX_ADMIN_KEY: "legacy-secret",
      },
    })).toEqual({
      token: "legacy-secret",
      source: "legacy",
      envVar: "CONVEX_ADMIN_KEY",
    });
  });

  it("fails clearly when an admin intent token is missing", () => {
    expect(() => requireAdminIntentToken("citationEvidenceWrite", { env: {} })).toThrow(
      /CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE, CONVEX_ADMIN_KEY/,
    );
  });
});

describe("writeAuditLog and updateAuditLog", () => {
  it("writes a timestamped audit log to the specified directory", async () => {
    const root = await makeTmpRepo();
    const logDir = path.join(root, "audit-logs");

    const { path: logPath, entry } = writeAuditLog({
      operation: "citation-apply",
      intent: "citationEvidenceWrite",
      slug: "2c-b",
      mutations: [{ field: "summary", action: "update" }],
      logDir,
      repoRoot: root,
    });

    expect(existsSync(logPath)).toBe(true);
    expect(entry.operation).toBe("citation-apply");
    expect(entry.intent).toBe("citationEvidenceWrite");
    expect(entry.slug).toBe("2c-b");
    expect(entry.mutations).toHaveLength(1);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const content = JSON.parse(await readFile(logPath, "utf-8"));
    expect(content).toEqual(entry);
  });

  it("creates the log directory if it does not exist", async () => {
    const root = await makeTmpRepo();
    const logDir = path.join(root, "nested", "audit", "logs");

    expect(existsSync(logDir)).toBe(false);

    const { path: logPath } = writeAuditLog({
      operation: "test-op",
      logDir,
      repoRoot: root,
    });

    expect(existsSync(logDir)).toBe(true);
    expect(existsSync(logPath)).toBe(true);
  });

  it("throws when operation is missing", () => {
    expect(() => writeAuditLog({ intent: "test" })).toThrow(/operation is required/);
  });

  it("updates an existing audit log with new fields", async () => {
    const root = await makeTmpRepo();
    const logDir = path.join(root, "audit-logs");

    const { path: logPath } = writeAuditLog({
      operation: "migration",
      intent: "test",
      logDir,
      repoRoot: root,
    });

    const updated = updateAuditLog(logPath, {
      result: { created: 10, updated: 5 },
      status: "completed",
    });

    expect(updated.operation).toBe("migration");
    expect(updated.result).toEqual({ created: 10, updated: 5 });
    expect(updated.status).toBe("completed");
    expect(updated.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const content = JSON.parse(await readFile(logPath, "utf-8"));
    expect(content.result).toEqual({ created: 10, updated: 5 });
  });

  it("throws when updating a non-existent audit log", () => {
    expect(() => updateAuditLog("/nonexistent/path.json", {})).toThrow(/not found/);
  });
});

describe("backupBeforeWrite", () => {
  it("creates a timestamped backup of documents", async () => {
    const root = await makeTmpRepo();
    const backupDir = path.join(root, "backups");

    const mockDocuments = [
      { _id: "1", slug: "2c-b", title: "2C-B" },
      { _id: "2", slug: "lsd", title: "LSD" },
    ];

    const mockClient = {
      query: vi.fn().mockResolvedValue(mockDocuments),
    };

    const mockQuery = { name: "getAll" };

    const { path: backupPath, documentCount } = await backupBeforeWrite({
      sourceClient: mockClient,
      queryGetAll: mockQuery,
      label: "substanceIndex",
      backupDir,
      repoRoot: root,
    });

    expect(existsSync(backupPath)).toBe(true);
    expect(documentCount).toBe(2);
    expect(mockClient.query).toHaveBeenCalledWith(mockQuery, {});

    const content = JSON.parse(await readFile(backupPath, "utf-8"));
    expect(content.label).toBe("substanceIndex");
    expect(content.documentCount).toBe(2);
    expect(content.documents).toEqual(mockDocuments);
    expect(content.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("creates the backup directory if it does not exist", async () => {
    const root = await makeTmpRepo();
    const backupDir = path.join(root, "nested", "backups");

    const mockClient = {
      query: vi.fn().mockResolvedValue([]),
    };

    expect(existsSync(backupDir)).toBe(false);

    await backupBeforeWrite({
      sourceClient: mockClient,
      queryGetAll: {},
      label: "test-table",
      backupDir,
      repoRoot: root,
    });

    expect(existsSync(backupDir)).toBe(true);
  });

  it("passes queryArgs to the query", async () => {
    const root = await makeTmpRepo();
    const backupDir = path.join(root, "backups");

    const mockClient = {
      query: vi.fn().mockResolvedValue([]),
    };

    const mockQuery = { name: "getBySlug" };
    const queryArgs = { slug: "2c-b" };

    await backupBeforeWrite({
      sourceClient: mockClient,
      queryGetAll: mockQuery,
      queryArgs,
      label: "article-backup",
      backupDir,
      repoRoot: root,
    });

    expect(mockClient.query).toHaveBeenCalledWith(mockQuery, { slug: "2c-b" });
  });

  it("throws when required parameters are missing", async () => {
    await expect(backupBeforeWrite({})).rejects.toThrow(/sourceClient is required/);
    await expect(backupBeforeWrite({ sourceClient: {} })).rejects.toThrow(/queryGetAll is required/);
    await expect(backupBeforeWrite({ sourceClient: {}, queryGetAll: {} })).rejects.toThrow(/label is required/);
  });
});

describe("batchAndApplyMutations", () => {
  it("processes items in batches and aggregates results", async () => {
    const items = Array.from({ length: 75 }, (_, i) => ({ id: i, name: `item-${i}` }));

    const mockMutation = { name: "bulkImport" };
    const mockClient = {
      mutation: vi.fn()
        .mockResolvedValueOnce({ created: 50, updated: 0, errors: [] })
        .mockResolvedValueOnce({ created: 25, updated: 0, errors: [] }),
    };

    const onBatchResult = vi.fn();

    const result = await batchAndApplyMutations({
      items,
      batchSize: 50,
      mutation: mockMutation,
      client: mockClient,
      onBatchResult,
    });

    expect(result.totalCreated).toBe(75);
    expect(result.totalUpdated).toBe(0);
    expect(result.allErrors).toHaveLength(0);
    expect(result.failed).toBe(false);
    expect(result.dryRun).toBe(false);

    expect(mockClient.mutation).toHaveBeenCalledTimes(2);
    expect(onBatchResult).toHaveBeenCalledTimes(2);
  });

  it("respects dry-run mode from run context", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const mockClient = { mutation: vi.fn() };
    const logger = { log: vi.fn() };

    const runContext = createDataOpsRunContext({
      operation: "test",
      intent: "test",
      argv: ["--dry-run"],
      loadsEnvLocal: false,
      env: {},
    });

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
      runContext,
      logger,
    });

    expect(result.dryRun).toBe(true);
    expect(result.totalCreated).toBe(0);
    expect(mockClient.mutation).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
  });

  it("blocks writes when writeEnabled is false", async () => {
    const items = [{ id: 1 }];
    const mockClient = { mutation: vi.fn() };
    const logger = { log: vi.fn() };

    const runContext = createDataOpsRunContext({
      operation: "test",
      intent: "test",
      argv: [],
      loadsEnvLocal: false,
      env: {},
      requiresExecute: true,
      executeFlag: "--execute",
    });

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
      runContext,
      logger,
    });

    expect(result.failed).toBe(true);
    expect(result.allErrors).toContain("Writes not enabled");
    expect(mockClient.mutation).not.toHaveBeenCalled();
  });

  it("uses transformBatch to customize mutation args", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const mockMutation = { name: "bulkImport" };
    const mockClient = {
      mutation: vi.fn().mockResolvedValue({ created: 2, updated: 0, errors: [] }),
    };

    const transformBatch = (batch, batchIndex) => ({
      reports: batch,
      batchNumber: batchIndex,
    });

    await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: mockMutation,
      transformBatch,
      client: mockClient,
    });

    expect(mockClient.mutation).toHaveBeenCalledWith(mockMutation, {
      reports: items,
      batchNumber: 0,
    });
  });

  it("calls onBatchError when a batch fails", async () => {
    const items = [{ id: 1 }];
    const mockClient = {
      mutation: vi.fn().mockRejectedValue(new Error("Network error")),
    };

    const onBatchError = vi.fn();

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
      onBatchError,
    });

    expect(result.failed).toBe(true);
    expect(result.allErrors).toHaveLength(1);
    expect(result.allErrors[0]).toContain("Network error");
    expect(onBatchError).toHaveBeenCalledWith(
      expect.any(Error),
      0,
      items
    );
  });

  it("aggregates errors from mutation results", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const mockClient = {
      mutation: vi.fn().mockResolvedValue({
        created: 1,
        updated: 0,
        errors: ["Item 2 failed validation"],
      }),
    };

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
    });

    expect(result.totalCreated).toBe(1);
    expect(result.allErrors).toContain("Item 2 failed validation");
    expect(result.failed).toBe(true);
  });

  it("throws when required parameters are missing", async () => {
    await expect(batchAndApplyMutations({})).rejects.toThrow(/items array is required/);
    await expect(batchAndApplyMutations({ items: [] })).rejects.toThrow(/mutation is required/);
    await expect(batchAndApplyMutations({ items: [], mutation: {} })).rejects.toThrow(/client is required/);
  });
});
