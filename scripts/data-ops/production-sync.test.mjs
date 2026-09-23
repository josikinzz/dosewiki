import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { getFunctionName } from "../../lib/postgres/runtime/api.ts";
import { createDataOpsRunContext, productionOperationName } from "../lib/data-ops-run-context.mjs";
import {
  PRODUCTION_SYNC_OPERATION,
  PRODUCTION_SYNC_TABLES,
  planProductionSync,
  productionSyncUsage,
  runProductionSync,
} from "./production-sync.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(repoRoot, "scripts/data-ops/sync-data-to-production.mjs");
const phrase = productionOperationName(PRODUCTION_SYNC_OPERATION);

function fakeClients({ rowErrors = {} } = {}) {
  const events = [];
  const docs = [{ _id: "placeholder-id", _creationTime: 1, slug: "placeholder", key: "about", content: "x" }];
  const sourceClient = { query: vi.fn(async () => docs) };
  const targetClient = {
    query: vi.fn(async () => []),
    mutation: vi.fn(async (reference) => {
      const name = getFunctionName(reference);
      events.push(`write ${name}`);
      const table = Object.keys(rowErrors).find((key) => name.includes(key));
      return { created: 1, updated: 0, errors: table ? rowErrors[table] : [] };
    }),
  };
  const backup = vi.fn(async ({ label }) => {
    events.push(`backup ${label}`);
    return { path: `backups/${label}.json`, documentCount: 0 };
  });
  return { events, sourceClient, targetClient, backup };
}

const quiet = { log: () => {} };
const credentials = Object.fromEntries(PRODUCTION_SYNC_TABLES.map((table) => [table, { token: "placeholder-token" }]));

describe("production data sync", () => {
  it("documents the confirmation phrase the command derives", () => {
    expect(createDataOpsRunContext({ operation: PRODUCTION_SYNC_OPERATION, argv: [], loadsEnvLocal: false, env: { DATA_BACKEND: "postgres" } }).operationName).toBe(phrase);
    expect(productionSyncUsage()).toContain(`--confirm-write=${phrase}`);
    const header = readFileSync(script, "utf8").split("*/")[0];
    expect([...header.matchAll(/--confirm-write=([a-z0-9-]+)/g)].map((match) => match[1])).toEqual([phrase]);
  });

  it("plans one backup per selected table", () => {
    expect(planProductionSync(["tripReports", "quotes"]).backups.map(({ table }) => table)).toEqual(["tripReports", "quotes"]);
    expect(planProductionSync(null).backups.map(({ table }) => table)).toEqual([...PRODUCTION_SYNC_TABLES]);
    expect(PRODUCTION_SYNC_TABLES).toHaveLength(10);
  });

  it("backs up every selected table before the first write", async () => {
    const { events, sourceClient, targetClient, backup } = fakeClients();
    const selectedTables = ["tripReports", "prompts", "replications"];
    const outcome = await runProductionSync({ sourceClient, targetClient, selectedTables, credentials, backup, logger: quiet });
    expect(outcome.exitCode).toBe(0);
    const firstWrite = events.findIndex((event) => event.startsWith("write "));
    expect(events.slice(0, firstWrite)).toEqual(selectedTables.map((table) => `backup ${table}-production`));
  });

  it("exits 1 when one row reports an error", async () => {
    const { sourceClient, targetClient, backup } = fakeClients({ rowErrors: { tripReports: ["Report placeholder: slug appears more than once in this batch"] } });
    const outcome = await runProductionSync({ sourceClient, targetClient, selectedTables: ["tripReports", "quotes"], credentials, backup, logger: quiet });
    expect(outcome.totalErrors).toBe(1);
    expect(outcome.exitCode).toBe(1);
  });

  it("exits 1 when a batch mutation rejects", async () => {
    const { sourceClient, targetClient, backup } = fakeClients();
    targetClient.mutation.mockRejectedValueOnce(new Error("Report placeholder: duplicate key value violates unique constraint"));
    const outcome = await runProductionSync({ sourceClient, targetClient, selectedTables: ["tripReports"], credentials, backup, logger: quiet });
    expect(outcome.exitCode).toBe(1);
  });

  it("backs up full target documents, not the public projections the sync copies", async () => {
    const { sourceClient, targetClient } = fakeClients();
    const reads = {};
    const backup = vi.fn(async ({ label, queryAll }) => {
      const before = targetClient.query.mock.calls.length;
      await queryAll();
      reads[label] = targetClient.query.mock.calls.slice(before).map(([reference]) => getFunctionName(reference));
      return { path: `backups/${label}.json`, documentCount: 0 };
    });
    await runProductionSync({ sourceClient, targetClient, selectedTables: ["tripReports", "effectIndexArticles"], credentials, backup, logger: quiet });
    expect(reads).toEqual({
      "tripReports-production": ["tripReports:getAllDocumentsForBackup"],
      "effectIndexArticles-production": ["effectIndexArticles:getAllDocumentsForBackup"],
    });
  });

  it("writes nothing when a backup fails", async () => {
    const { sourceClient, targetClient } = fakeClients();
    const backup = vi.fn(async () => { throw new Error("backup read failed"); });
    await expect(runProductionSync({ sourceClient, targetClient, selectedTables: ["tripReports"], credentials, backup, logger: quiet })).rejects.toThrow(/backup read failed/);
    expect(targetClient.mutation).not.toHaveBeenCalled();
  });

  it("prints the backup plan without connecting when no write is requested", () => {
    const workspace = mkdtempSync(join(os.tmpdir(), "production-sync-plan-"));
    try {
      writeFileSync(join(workspace, "package.json"), "{}\n");
      const result = spawnSync("bun", ["--no-env-file", script, "--tables=tripReports,quotes,articleSources"], {
        cwd: workspace,
        encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: process.env.HOME, DATA_BACKEND: "postgres" },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.match(/^ {2}backup \S+/gm)).toEqual(["  backup tripReports", "  backup quotes"]);
      expect(result.stdout).toContain(`--confirm-write=${phrase}`);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
