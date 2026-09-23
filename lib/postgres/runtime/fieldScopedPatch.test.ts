import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresClient } from "./client";

vi.mock("server-only", () => ({}));

vi.mock("./functions.generated", async () => {
  const { mutation } = await import("./server");
  const { v } = await import("./values");
  type Ctx = { db: { patch(id: string, value: Record<string, unknown>): Promise<void> } };
  return { functionModules: {
    fixture: {
      patchContent: mutation({
        args: { id: v.id("prompts"), content: v.optional(v.string()), updatedBy: v.optional(v.string()) },
        returns: v.null(),
        handler: async (ctx: Ctx, args: { id: string; content?: string; updatedBy?: string }) => {
          const { id, ...value } = args;
          await ctx.db.patch(id, value);
          return null;
        },
      }),
    },
  } };
});

const UNTAGGED_PROMPT = "a".repeat(32);

function fakePool(rowCount = 1) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const query = vi.fn(async (statement: string, values: unknown[] = []) => {
    sql.push(statement);
    params.push(values);
    if (statement.includes('FROM "documentIds"')) return { rows: [{ _id: UNTAGGED_PROMPT, table: "prompts" }], rowCount: 1 };
    return { rows: [], rowCount };
  });
  const pool = { on: vi.fn(), connect: vi.fn(async () => ({ query, release: vi.fn() })) };
  return { pool, sql, params };
}

describe("field-scoped runtime patch", () => {
  // CI runs with the freeze on; these cases exercise the open-write path.
  beforeEach(() => { vi.stubEnv("DATA_WRITES_FROZEN", "0"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("updates only the patched column", async () => {
    const { pool, sql, params } = fakePool();
    await new PostgresClient(pool as never).mutation("fixture:patchContent" as never, { id: UNTAGGED_PROMPT, content: "Updated prompt" } as never);
    const updates = sql.filter((statement) => statement.startsWith('UPDATE "prompts"'));
    expect(updates).toEqual(['UPDATE "prompts" SET "content" = $1 WHERE "_id" = $2']);
    expect(params[sql.indexOf(updates[0])]).toEqual(["Updated prompt", UNTAGGED_PROMPT]);
    expect(sql.some((statement) => statement.startsWith("SELECT") && statement.includes('FROM "prompts"'))).toBe(false);
  });

  it("clears an optional field and refuses a missing document", async () => {
    const cleared = fakePool();
    await new PostgresClient(cleared.pool as never).mutation("fixture:patchContent" as never, { id: UNTAGGED_PROMPT, updatedBy: undefined } as never);
    expect(cleared.sql.filter((statement) => statement.startsWith('UPDATE "prompts"'))).toEqual(['UPDATE "prompts" SET "updatedBy" = NULL WHERE "_id" = $1']);

    const missing = fakePool(0);
    await expect(new PostgresClient(missing.pool as never).mutation("fixture:patchContent" as never, { id: UNTAGGED_PROMPT, content: "Updated prompt" } as never))
      .rejects.toThrow(`Document ${UNTAGGED_PROMPT} does not exist in prompts`);
  });

  it("resolves argument ids inside the callable's one transaction", async () => {
    const { pool, sql } = fakePool();
    await new PostgresClient(pool as never).mutation("fixture:patchContent" as never, { id: UNTAGGED_PROMPT, content: "Updated prompt" } as never);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    const lookup = sql.findIndex((statement) => statement.includes('FROM "documentIds"'));
    expect(sql[0]).toMatch(/^BEGIN ISOLATION LEVEL SERIALIZABLE;\s*SET LOCAL statement_timeout/);
    expect(lookup).toBeGreaterThan(0);
    expect(sql.filter((statement) => statement.startsWith("BEGIN"))).toHaveLength(1);
    expect(sql.filter((statement) => statement.includes("SET LOCAL") && !statement.startsWith("BEGIN"))).toEqual([]);
  });
});
