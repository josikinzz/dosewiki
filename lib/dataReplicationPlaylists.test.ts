import { PostgresError } from "@server/postgres/runtime/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignOwnerHandler,
  canEditPlaylist,
  removeHandler,
  setMembershipHandler,
  upsertHandler,
} from "../server/replicationPlaylists";

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };

/**
 * In-memory tables with the two query shapes the playlist handlers use:
 * `withIndex(...).eq(field, value)` and a bare `collect()` over a table.
 */
function createCtx(seed: Record<string, Row[]>) {
  const tables = new Map<string, Map<string, Row>>();
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, new Map(rows.map((row) => [row._id, { ...row }])));
  }
  let nextId = 1;
  const rowsOf = (table: string) => {
    if (!tables.has(table)) {
      tables.set(table, new Map());
    }
    return tables.get(table)!;
  };

  const resultsOf = (matches: Row[]) => ({
    first: async () => matches[0] ?? null,
    unique: async () => {
      if (matches.length > 1) throw new Error(`${matches.length} rows matched`);
      return matches[0] ?? null;
    },
    collect: async () => matches,
  });

  const query = (table: string) => ({
    ...resultsOf([...rowsOf(table).values()]),
    withIndex: (
      _indexName: string,
      selector: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => {
      let field = "";
      let value: unknown;
      selector({
        eq: (name, candidate) => {
          field = name;
          value = candidate;
          return {};
        },
      });
      return resultsOf([...rowsOf(table).values()].filter((row) => row[field] === value));
    },
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        query: vi.fn(query),
        insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
          const _id = `${table}:${nextId++}`;
          rowsOf(table).set(_id, { _id, ...doc });
          return _id;
        }),
        patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          for (const rows of tables.values()) {
            const existing = rows.get(id);
            if (existing) rows.set(id, { ...existing, ...patch });
          }
        }),
        delete: vi.fn(async (id: string) => {
          for (const rows of tables.values()) rows.delete(id);
        }),
      },
    } as never,
    rowsOf,
  };
}

const admin: Row = {
  _id: "m0",
  email: "admin@example.com",
  role: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const editor: Row = { ...admin, _id: "m1", email: "editor@example.com", role: "editor" };
const ada: Row = { ...admin, _id: "m2", email: "ada@example.com", role: "contributor" };
const bob: Row = { ...admin, _id: "m3", email: "bob@example.com", role: "contributor" };
const members = [admin, editor, ada, bob];

const replication = (slug: string): Row => ({
  _id: `r-${slug}`,
  slug,
  title: `${slug} vision`,
  artist: "Someone",
  type: "image",
  showcase_excluded: false,
  primary_url: `https://cdn.example/${slug}.png`,
});

const adasList: Row = {
  _id: "p1",
  key: "adas-list",
  owner_email: "ada@example.com",
  title: "Ada's list",
  replication_slugs: ["alpha"],
  updated_at: "2026-02-01T00:00:00.000Z",
  updated_by: "ada@example.com",
};
const unowned: Row = {
  _id: "p2",
  key: "house-opener",
  title: "House opener",
  replication_slugs: ["alpha", "beta"],
  updated_at: "2026-02-01T00:00:00.000Z",
  updated_by: "admin@example.com",
};

function seed() {
  return createCtx({
    memberships: members,
    replicationPlaylists: [adasList, unowned],
    replications: [replication("alpha"), replication("beta"), replication("gamma")],
  });
}

const as = (actorEmail: string) => ({ apiKey: SERVER_KEY, actorEmail });
async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof PostgresError) {
      const data: unknown = error.data;
      if (data && typeof data === "object" && "code" in data && typeof data.code === "string") {
        return data.code;
      }
      return undefined;
    }
    throw error;
  }
}

describe("canEditPlaylist", () => {
  it("admits the owner and any admin, nobody else, and never an unowned row's non-admin", () => {
    expect(canEditPlaylist({ role: "contributor", email: "ada@example.com" }, { owner_email: "ada@example.com" })).toBe(true);
    expect(canEditPlaylist({ role: "editor", email: "editor@example.com" }, { owner_email: "ada@example.com" })).toBe(false);
    expect(canEditPlaylist({ role: "admin", email: "admin@example.com" }, { owner_email: "ada@example.com" })).toBe(true);
    expect(canEditPlaylist({ role: "contributor", email: "ada@example.com" }, {})).toBe(false);
    expect(canEditPlaylist({ role: "admin", email: "admin@example.com" }, {})).toBe(true);
  });
});

describe("replicationPlaylists ownership", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("stamps a contributor's save with their own email whatever updatedBy the request carried", async () => {
    const { ctx, rowsOf } = seed();
    await upsertHandler(ctx, {
      ...as("ada@example.com"),
      key: "adas-list",
      title: "Ada's list",
      replication_slugs: ["alpha"],
      updatedBy: "admin@example.com",
    });
    expect(rowsOf("replicationPlaylists").get("p1")).toMatchObject({ updated_by: "ada@example.com" });

    // An admin may attribute a write to someone else (migration scripts).
    await upsertHandler(ctx, {
      ...as("admin@example.com"),
      key: "house-opener",
      title: "House opener",
      replication_slugs: ["alpha"],
      updatedBy: "importer@example.com",
    });
    expect(rowsOf("replicationPlaylists").get("p2")).toMatchObject({ updated_by: "importer@example.com" });
  });

  it("refuses a contributor writing to another member's playlist with NOT_OWNER", async () => {
    const { ctx, rowsOf } = seed();
    await expect(
      codeOf(
        upsertHandler(ctx, {
          ...as("bob@example.com"),
          key: "adas-list",
          title: "Taken over",
          replication_slugs: [],
        }),
      ),
    ).resolves.toBe("NOT_OWNER");
    await expect(
      codeOf(
        setMembershipHandler(ctx, {
          ...as("bob@example.com"),
          key: "adas-list",
          replicationSlug: "beta",
          included: true,
        }),
      ),
    ).resolves.toBe("NOT_OWNER");
    await expect(codeOf(removeHandler(ctx, { ...as("bob@example.com"), key: "adas-list" }))).resolves.toBe("NOT_OWNER");
    expect(rowsOf("replicationPlaylists").get("p1")).toMatchObject({ title: "Ada's list", replication_slugs: ["alpha"] });
  });

  it("refuses an editor writing to someone else's playlist: editors read, they do not own", async () => {
    const { ctx } = seed();
    await expect(
      codeOf(
        upsertHandler(ctx, {
          ...as("editor@example.com"),
          key: "adas-list",
          title: "Edited",
          replication_slugs: ["alpha"],
        }),
      ),
    ).resolves.toBe("NOT_OWNER");
  });

  it("keeps an unowned playlist admin-only", async () => {
    const { ctx, rowsOf } = seed();
    await expect(codeOf(removeHandler(ctx, { ...as("ada@example.com"), key: "house-opener" }))).resolves.toBe("NOT_OWNER");
    await expect(
      codeOf(upsertHandler(ctx, { ...as("ada@example.com"), key: "house-opener", title: "Mine now", replication_slugs: [] })),
    ).resolves.toBe("NOT_OWNER");
    expect(rowsOf("replicationPlaylists").has("p2")).toBe(true);
  });

  it("refuses a non-admin passing owner_email on their own playlist", async () => {
    const { ctx } = seed();
    await expect(
      codeOf(
        upsertHandler(ctx, {
          ...as("ada@example.com"),
          key: "adas-list",
          title: "Ada's list",
          replication_slugs: ["alpha"],
          owner_email: "bob@example.com",
        }),
      ),
    ).resolves.toBe("FORBIDDEN");
  });

  it("assignOwner requires an admin and an existing member", async () => {
    const { ctx, rowsOf } = seed();
    await expect(
      assignOwnerHandler(ctx, { ...as("ada@example.com"), key: "house-opener", ownerEmail: "ada@example.com" }),
    ).rejects.toThrow(/Admin access required/);
    await expect(
      assignOwnerHandler(ctx, { ...as("editor@example.com"), key: "house-opener", ownerEmail: "ada@example.com" }),
    ).rejects.toThrow(/Admin access required/);
    await expect(
      codeOf(assignOwnerHandler(ctx, { ...as("admin@example.com"), key: "house-opener", ownerEmail: "ghost@example.com" })),
    ).resolves.toBe("MEMBER_NOT_FOUND");
    expect(rowsOf("replicationPlaylists").get("p2")?.owner_email).toBeUndefined();
  });
});
