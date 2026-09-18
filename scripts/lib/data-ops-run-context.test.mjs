import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
findRepoRoot,
getAdminIntentEnvVar,
loadEnvFiles,
parseEnvFileContent,
requireAdminIntentToken,
resolveAdminIntentToken,  } from "./data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "./data-ops-audit.mjs"

const tmpRoots = [];

async function makeTmpRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-data-ops-"));
  tmpRoots.push(root);
  await writeFile(path.join(root, "package.json"), "{}\n");
  await mkdir(path.join(root, "scripts", "data-ops"), { recursive: true });
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
        "POSTGRES_POOLED_URL=postgres://localhost/development",
        "export POSTGRES_DIRECT_URL='postgres://localhost/direct'",
        "DATA_ADMIN_KEY=\"local-secret\"",
      ].join("\n"),
    );

    const env = { POSTGRES_POOLED_URL: "postgres://localhost/shell" };
    const loaded = loadEnvFiles({ rootDir: root, env });

    expect(loaded[".env.local"].DATA_ADMIN_KEY).toBe("local-secret");
    expect(env.POSTGRES_POOLED_URL).toBe("postgres://localhost/shell");
    expect(env.POSTGRES_DIRECT_URL).toBe("postgres://localhost/direct");
    expect(env.DATA_ADMIN_KEY).toBe("local-secret");
  });

  it("resolves repo root from a nested script directory", async () => {
    const root = await makeTmpRepo();
    const nested = path.join(root, "scripts", "data-ops");

    expect(findRepoRoot(nested)).toBe(root);
  });

  it("resolves independent Postgres read and write destinations", () => {
    const context = createDataOpsRunContext({
      operation: "copy", intent: "cross-deployment-copy", argv: [], loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres", SOURCE_POSTGRES_URL: "postgres://source.example/db", TARGET_POSTGRES_URL: "postgres://target.example/db" },
    });
    expect(context.sourceUrl).toBe("postgres://source.example/db");
    expect(context.targetUrl).toBe("postgres://target.example/db");
  });

  it("blocks dry-run writes through the shared policy", () => {
    const context = createDataOpsRunContext({
      operation: "local prepopulate", intent: "local-prepopulate", argv: ["--dry-run"], loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres" }, sourceUrlKeys: [], targetUrlKeys: [],
    });
    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/dry-run mode/);
  });

  it("requires destructive confirmation, operation phrase, and exact target identity", () => {
    const options = {
      operation: "production sync", intent: "production-sync", loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgres://prod.example/db" },
      confirmationFlag: "--confirm-production-sync", destructive: true,
    };
    const steps = [
      { argv: ["--write"], error: /--confirm-production-sync/ },
      { argv: ["--write", "--confirm-production-sync"], error: /--confirm-write/ },
      { argv: ["--write", "--confirm-production-sync", "--confirm-write=production-sync"], error: /--expected-deployment/ },
      { argv: ["--write", "--confirm-production-sync", "--confirm-write=production-sync", "--expected-deployment=other.example/db"], error: /does not match/ },
    ];
    for (const { argv, error } of steps) expect(() => assertDataOpsWriteAllowed(createDataOpsRunContext({ ...options, argv }))).toThrow(error);
  });

  it("does not authorize application fallback URLs or absent targets", () => {
    for (const env of [
      { DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://prod.example/db" },
      { DATA_BACKEND: "postgres", LEGACY_BACKEND_URL: "https://legacy.example.invalid" },
    ]) {
      const context = createDataOpsRunContext({ operation: "copy", argv: ["--write"], loadsEnvLocal: false, env });
      expect(() => assertDataOpsWriteAllowed(context)).toThrow(/explicit|TARGET_POSTGRES_URL/);
    }
  });

  it("does not let local target opt-ins bypass the common confirmation ceremony", () => {
    const context = createDataOpsRunContext({
      operation: "local replication import", argv: ["--execute", "--write"], loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgres://localhost/db" },
      requiresExecute: true, allowLocalTarget: true,
    });
    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/--confirm-write/);
  });

  it("rejects invalid explicit source and target selections without fallback", () => {
    for (const env of [
      { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "https://legacy.example.invalid" },
      { DATA_BACKEND: "postgres", SOURCE_POSTGRES_URL: "", POSTGRES_POOLED_URL: "postgres://localhost/db" },
    ]) expect(() => createDataOpsRunContext({ operation: "copy", argv: [], loadsEnvLocal: false, env })).toThrow(/Postgres/);
  });

  it("parses bare env content", () => {
    expect(parseEnvFileContent("A=1\nexport B='two'\n# nope\nC=\"three\"\n")).toEqual({
      A: "1",
      B: "two",
      C: "three",
    });
  });

  it("prefers scoped admin intent tokens before the legacy admin key", () => {
    expect(getAdminIntentEnvVar("citationEvidenceWrite")).toBe("DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE");

    expect(resolveAdminIntentToken("citationEvidenceWrite", {
      env: {
        DATA_ADMIN_KEY: "legacy-secret",
        DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE: "citation-secret",
      },
    })).toEqual({
      token: "citation-secret",
      source: "scoped",
      envVar: "DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE",
    });
  });

  it.each([
    ["editorArticleWrite", "DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE"],
    ["promptMigrationWrite", "DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE"],
    ["profileMediaWrite", "DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE"],
    ["quoteMigrationWrite", "DATA_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE"],
    ["generatedPublicationWrite", "DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE"],
    ["reagentTestImport", "DATA_ADMIN_TOKEN_REAGENT_TEST_IMPORT"],
  ])("prefers %s scoped credentials over the master key", (intent, envVar) => {
    expect(requireAdminIntentToken(intent, {
      env: {
        DATA_ADMIN_KEY: "master-key",
        [envVar]: "scoped-key",
      },
    })).toMatchObject({ token: "scoped-key", source: "scoped", envVar });
  });

  it("falls back to the legacy admin key for admin intents when no scoped token exists", () => {
    expect(requireAdminIntentToken("citationEvidenceReview", {
      env: {
        DATA_ADMIN_KEY: "legacy-secret",
      },
    })).toEqual({
      token: "legacy-secret",
      source: "legacy",
      envVar: "DATA_ADMIN_KEY",
    });
  });

  it("fails clearly when an admin intent token is missing", () => {
    expect(() => requireAdminIntentToken("citationEvidenceWrite", { env: {} })).toThrow(
      /DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE, DATA_ADMIN_KEY/,
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

  it("accepts a bounded paginated query callback", async () => {
    const root = await makeTmpRepo();
    const documents = [{ _id: "1" }, { _id: "2" }];
    const queryAll = vi.fn().mockResolvedValue(documents);
    const mockClient = { query: vi.fn() };

    const result = await backupBeforeWrite({
      sourceClient: mockClient,
      queryAll,
      label: "substanceIndex-page-backup",
      repoRoot: root,
    });

    expect(result.documentCount).toBe(2);
    expect(queryAll).toHaveBeenCalledOnce();
    expect(mockClient.query).not.toHaveBeenCalled();
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

  it("backs up a single queried document as a one-item collection", async () => {
    const root = await makeTmpRepo();
    const article = { _id: "article-1", slug: "desomorphine" };
    const mockQuery = {};
    const mockClient = { query: vi.fn().mockResolvedValue(article) };

    const result = await backupBeforeWrite({
      sourceClient: mockClient,
      queryGetAll: mockQuery,
      queryArgs: { slug: "desomorphine" },
      label: "article-backup",
      repoRoot: root,
    });

    const backup = JSON.parse(await readFile(result.path, "utf8"));
    expect(result.documentCount).toBe(1);
    expect(backup.documents).toEqual([article]);
    expect(mockClient.query).toHaveBeenCalledWith(mockQuery, { slug: "desomorphine" });
  });

  it("reuses a verified existing backup without querying Postgres", async () => {
    const root = await makeTmpRepo();
    const backupPath = path.join(root, "snapshot.zip");
    await writeFile(backupPath, "verified snapshot");
    const mockClient = { query: vi.fn() };

    const result = await backupBeforeWrite({
      sourceClient: mockClient,
      queryGetAll: {},
      label: "article-backup",
      existingBackupPath: "snapshot.zip",
      repoRoot: root,
    });

    expect(result).toEqual({ path: backupPath, documentCount: null, reused: true });
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("rejects a missing existing backup", async () => {
    const root = await makeTmpRepo();

    await expect(backupBeforeWrite({
      sourceClient: {},
      queryGetAll: {},
      label: "article-backup",
      existingBackupPath: "missing.zip",
      repoRoot: root,
    })).rejects.toThrow(/existing backup.*not found/i);
  });

  it("throws when required parameters are missing", async () => {
    await expect(backupBeforeWrite({})).rejects.toThrow(/sourceClient is required/);
    await expect(backupBeforeWrite({ sourceClient: {} })).rejects.toThrow(/queryGetAll or queryAll is required/);
    await expect(backupBeforeWrite({ sourceClient: {}, queryGetAll: {} })).rejects.toThrow(/label is required/);
  });
});
