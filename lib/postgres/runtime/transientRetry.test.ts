import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresClient } from "./client";
import { classifyPostgresError } from "../postgresErrors";

vi.mock("server-only", () => ({}));

const handlerSql = vi.hoisted(() => ({ statement: 'SELECT "url" FROM "storageObjects"' }));

vi.mock("./functions.generated", async () => {
  const { mutation, query } = await import("./server");
  const { v } = await import("./values");
  return { functionModules: {
    fixture: {
      touch: mutation({
        args: { actorEmail: v.string() },
        returns: v.string(),
        handler: async (ctx: { storage: { getUrl(id: string): Promise<string | null> } }) => {
          await ctx.storage.getUrl("fixture-storage-id");
          return "committed";
        },
      }),
      read: query({
        args: {},
        returns: v.string(),
        handler: async (ctx: { storage: { getUrl(id: string): Promise<string | null> } }) => {
          await ctx.storage.getUrl("fixture-storage-id");
          return "read";
        },
      }),
    },
  } };
});

const sqlStateError = (code: string) => Object.assign(new Error(`SQLSTATE ${code}`), { code });

function fakePool(failures: Array<{ on: string; error: Error } | { connect: Error }>) {
  const sql: string[] = [];
  const query = vi.fn(async (statement: string) => {
    sql.push(statement);
    const next = failures[0];
    if (next && "on" in next && statement.startsWith(next.on)) {
      failures.shift();
      throw next.error;
    }
    return { rows: [], rowCount: 1 };
  });
  const connect = vi.fn(async () => {
    const next = failures[0];
    if (next && "connect" in next) {
      failures.shift();
      throw next.connect;
    }
    const release = vi.fn();
    releases.push(release);
    return { query, release };
  });
  const releases: Array<ReturnType<typeof vi.fn>> = [];
  return { pool: { on: vi.fn(), connect }, sql, releases };
}

// CI runs with the freeze on; each case opens writes unless it tests the freeze.
beforeEach(() => { vi.stubEnv("DATA_WRITES_FROZEN", "0"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("runtime client transient retry", () => {
  it("reruns a read-only query whose connection dropped and discards that client", async () => {
    const lost = new Error("Connection terminated unexpectedly");
    const { pool, sql, releases } = fakePool([{ on: handlerSql.statement, error: lost }]);
    const client = new PostgresClient(pool as never);
    await expect(client.query("fixture:read" as never)).resolves.toBe("read");
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(releases[0]).toHaveBeenCalledWith(lost);
    expect(releases[1]).toHaveBeenCalledWith(undefined);
    expect(sql.filter((statement) => statement === "ROLLBACK")).toHaveLength(0);
    expect(sql.filter((statement) => statement === "COMMIT")).toHaveLength(1);
  });

  it("never reruns a mutation whose connection dropped", async () => {
    const { pool } = fakePool([{ on: "COMMIT", error: new Error("Connection terminated unexpectedly") }]);
    const client = new PostgresClient(pool as never);
    await expect(client.mutation("fixture:touch" as never, { actorEmail: "editor@example.com" } as never)).rejects.toThrow("Connection terminated unexpectedly");
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it("surfaces a read-only query error that is not connection loss", async () => {
    const { pool } = fakePool([{ on: handlerSql.statement, error: sqlStateError("57014") }]);
    const client = new PostgresClient(pool as never);
    await expect(client.query("fixture:read" as never)).rejects.toThrow("SQLSTATE 57014");
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it("retries a mutation that hits a lock timeout and commits", async () => {
    const { pool, sql } = fakePool([{ on: handlerSql.statement, error: sqlStateError("55P03") }]);
    const client = new PostgresClient(pool as never);
    await expect(client.mutation("fixture:touch" as never, { actorEmail: "editor@example.com" } as never)).resolves.toBe("committed");
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(sql.filter((statement) => statement === "ROLLBACK")).toHaveLength(1);
    expect(sql.filter((statement) => statement === "COMMIT")).toHaveLength(1);
  });

  it("retries a mutation whose pool checkout timed out", async () => {
    const { pool, sql } = fakePool([{ connect: new Error("timeout exceeded when trying to connect") }]);
    const client = new PostgresClient(pool as never);
    await expect(client.mutation("fixture:touch" as never, { actorEmail: "editor@example.com" } as never)).resolves.toBe("committed");
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(sql.filter((statement) => statement === "COMMIT")).toHaveLength(1);
  });

  it("never retries a permanent failure", async () => {
    const { pool } = fakePool([{ on: handlerSql.statement, error: sqlStateError("23505") }]);
    const client = new PostgresClient(pool as never);
    await expect(client.mutation("fixture:touch" as never, { actorEmail: "editor@example.com" } as never)).rejects.toThrow("SQLSTATE 23505");
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it("surfaces a raw SQL freeze refusal as the frozen class without retrying", async () => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    const statement = 'INSERT INTO "fixtureRows" ("value") VALUES (1)';
    const { pool, sql } = fakePool([{ on: statement, error: sqlStateError("25006") }]);
    const client = new PostgresClient(pool as never);
    const error = await client.sql(statement).catch((caught: unknown) => caught);
    expect(classifyPostgresError(error)).toBe("frozen");
    expect(sql[0]).toMatch(/^BEGIN READ ONLY;/);
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it("retries a raw SQL statement after a transient failure", async () => {
    const statement = 'UPDATE "fixtureRows" SET "value" = 2';
    const { pool, sql } = fakePool([{ on: statement, error: sqlStateError("40P01") }]);
    const client = new PostgresClient(pool as never);
    await expect(client.sql(statement)).resolves.toEqual([]);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(sql.filter((entry) => entry === "COMMIT")).toHaveLength(1);
  });
});
