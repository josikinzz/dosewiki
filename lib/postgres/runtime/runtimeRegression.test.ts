import { describe, expect, it, vi } from "vitest";
import { PostgresClient } from "./client";
import { loadIdTableMap, mintDataId, PostgresDatabaseReader } from "./db";

vi.mock("server-only", () => ({}));

const ID_A = "a".repeat(32);
const ID_B = "b".repeat(32);
const ID_C = "c".repeat(32);

describe("runtime ID resolution", () => {
  it("queries only supplied IDs and never scans the identity table", async () => {
    const query = vi.fn(async (_sql: string, params?: unknown[]) => ({
      rows: (params?.[0] as string[]).includes(ID_A) ? [{ _id: ID_A, table: "replications" }] : [],
      rowCount: 1,
    }));
    const map = await loadIdTableMap({ query, statements: 0 }, [ID_A]);
    expect(map.get(ID_A)).toBe("replications");
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE "_id" = ANY'), [[ID_A]]);
  });

  it("rejects a fresh replication ID at a trip report argument boundary", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const pool = { on: vi.fn(), connect: vi.fn(async () => ({ query, release: vi.fn() })) };
    const client = new PostgresClient(pool as never);
    await expect(client.query("replicationIdentitySocial:getProfileAliasesPage" as never, {
      profile_id: mintDataId("tripReports"), limit: 1,
    } as never)).rejects.toThrow(/id belongs to tripReports, expected contributorProfiles/);
    expect(query.mock.calls.some((call) => String(call[0]).includes('SELECT "_id", "table" FROM "documentIds"'))).toBe(true);
    expect(query.mock.calls.every((call) => !String(call[0]).endsWith('FROM "documentIds"'))).toBe(true);
  });

  it("runs an ID-free callable without querying documentIds", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const pool = { on: vi.fn(), connect: vi.fn(async () => ({ query, release: vi.fn() })) };
    const client = new PostgresClient(pool as never);
    await expect(client.query("tripReports:getBySlug" as never, { slug: "missing" } as never)).resolves.toBeNull();
    expect(query.mock.calls.some((call) => String(call[0]).includes('FROM "documentIds"'))).toBe(false);
  });

  it("keeps imported and untagged IDs available to synchronous write proxies", async () => {
    const map = new Map([[ID_A, "replications"], [ID_B, "tripReports"]] as const);
    const db = new PostgresDatabaseReader({ query: vi.fn(), statements: 0 }, map as never);
    expect(db.normalizeId("replications", ID_A)).toBe(ID_A);
    expect(db.normalizeId("tripReports", ID_A)).toBeNull();
    expect(db.normalizeId("tripReports", ID_B)).toBe(ID_B);
  });
});

describe("nullable index pagination", () => {
  it.each(["asc", "desc"] as const)("continues after a missing indexed value in %s order", async (direction) => {
    const statements: string[] = [];
    const rows = [
      { _id: ID_A, _creationTime: 1, owner_email: null },
      { _id: ID_B, _creationTime: 2, owner_email: null },
      { _id: ID_C, _creationTime: 3, owner_email: "owner@example.com" },
    ];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      const after = sql.includes('"_id" COLLATE "C" >') || sql.includes('"_id" COLLATE "C" <');
      return { rows: after ? rows.slice(1, 3) : rows.slice(0, 2), rowCount: 2 };
    });
    const db = new PostgresDatabaseReader({ query, statements: 0 }, new Map());
    const first = await db.query("tripReports").withIndex("by_owner_email").order(direction).paginate({ numItems: 1, cursor: null });
    const second = await db.query("tripReports").withIndex("by_owner_email").order(direction).paginate({ numItems: 1, cursor: first.continueCursor });
    expect(second.page[0]?._id).toBe(ID_B);
    expect(statements[statements.length - 1]).toContain('"owner_email" COLLATE "C" IS NULL');
    expect(statements[statements.length - 1]).toContain('"_id"');
  });

  it("rejects cursors without a complete tie-breaker", async () => {
    const db = new PostgresDatabaseReader({ query: vi.fn(), statements: 0 }, new Map());
    await expect(db.query("tripReports").paginate({ numItems: 1, cursor: "{}" })).rejects.toThrow("Invalid pagination cursor");
  });

  it("accepts a legacy cursor that omits a missing optional index key", async () => {
    const statements: string[] = [];
    const db = new PostgresDatabaseReader({
      statements: 0,
      query: async (sql) => { statements.push(sql); return { rows: [], rowCount: 0 }; },
    }, new Map());
    const cursor = JSON.stringify({ _id: ID_A, _creationTime: 1 });
    await db.query("tripReports").withIndex("by_owner_email").paginate({ numItems: 1, cursor });
    expect(statements[0]).toContain('"owner_email" COLLATE "C" IS NULL');
  });
});
