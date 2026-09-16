import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresError } from "@server/postgres/runtime/values";
import { inviteCodeStatus, list, mint, redeem, revoke } from "../server/inviteCodes";

const SERVER_KEY = "test-admin-key";

type MembershipRow = {
  _id: string;
  email: string;
  username?: string;
  role: "admin" | "editor_translator" | "editor" | "translator" | "contributor" | "viewer";
  glossaryLocales?: string[];
  name?: string;
  passwordHash?: string;
  bannedAt?: string;
  invitedBy?: string;
  inviteCodeId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type InviteRow = {
  _id: string;
  codeHash: string;
  role: "editor" | "translator" | "editor_translator" | "contributor";
  glossaryLocales?: string[];
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  redemptions: { email: string; at: string }[];
  revokedAt?: string;
  note?: string;
};

type Row = MembershipRow | InviteRow;

/**
 * In-memory two-table db: `memberships` (by_email, by_username) and
 * `inviteCodes` (by_code_hash, by_created_at with order desc).
 */
function createCtx(seed: { memberships?: MembershipRow[]; inviteCodes?: InviteRow[] }) {
  const tables = {
    memberships: new Map((seed.memberships ?? []).map((row) => [row._id, { ...row }])),
    inviteCodes: new Map((seed.inviteCodes ?? []).map((row) => [row._id, { ...row }])),
  };
  let nextId = 100;

  const tableOf = (id: string) => (id.startsWith("inv") ? tables.inviteCodes : tables.memberships);

  const query = (table: keyof typeof tables) => ({
    withIndex: (
      indexName: string,
      selector?: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => {
      let field = "";
      let value: unknown;
      selector?.({
        eq: (name, candidate) => {
          field = name;
          value = candidate;
          return {};
        },
      });
      let rows = [...tables[table].values()] as Row[];
      if (field) {
        rows = rows.filter((row) => (row as Record<string, unknown>)[field] === value);
      }
      const cursor = {
        order: (direction: "asc" | "desc") => {
          const key = indexName.replace("by_", "").replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
          rows.sort((a, b) => {
            const av = String((a as Record<string, unknown>)[key]);
            const bv = String((b as Record<string, unknown>)[key]);
            return direction === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
          });
          return cursor;
        },
        unique: async () => {
          if (rows.length > 1) {
            throw new Error(`${indexName} returned ${rows.length} rows`);
          }
          return rows[0] ?? null;
        },
        collect: async () => rows,
        paginate: async ({ numItems }: { cursor: string | null; numItems: number }) => ({
          page: rows.slice(0, numItems),
          isDone: rows.length <= numItems,
          continueCursor: "",
        }),
      };
      return cursor;
    },
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        normalizeId: () => null, // Neither invite codes nor memberships are source tables.
        query: vi.fn(query),
        get: vi.fn(async (id: string) => tableOf(id).get(id) ?? null),
        patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          const table = tableOf(id);
          table.set(id, { ...table.get(id)!, ...patch } as never);
        }),
        insert: vi.fn(async (table: keyof typeof tables, doc: Record<string, unknown>) => {
          const _id = `${table === "inviteCodes" ? "inv" : "m"}${nextId++}`;
          tables[table].set(_id, { _id, ...doc } as never);
          return _id;
        }),
      },
    } as never,
    tables,
  };
}

type Handler = (ctx: never, args: unknown) => Promise<unknown>;
const handlerOf = (fn: unknown) => (fn as { _handler: Handler })._handler;

const mintHandler = handlerOf(mint);
const listHandler = handlerOf(list);
const revokeHandler = handlerOf(revoke);
const redeemHandler = handlerOf(redeem);

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const STORED_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";

const admin: MembershipRow = {
  _id: "m1",
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const editor: MembershipRow = {
  _id: "m2",
  email: "editor@example.com",
  username: "editor",
  role: "editor",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const NOW = Date.parse("2026-09-03T12:00:00.000Z");

const activeCode = (overrides: Partial<InviteRow> = {}): InviteRow => ({
  _id: "inv1",
  codeHash: HASH_A,
  role: "editor",
  createdBy: "admin@example.com",
  createdAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-09-08T00:00:00.000Z",
  maxUses: 1,
  redemptions: [],
  ...overrides,
});

const asAdmin = { apiKey: SERVER_KEY, actorEmail: admin.email };
const asEditor = { apiKey: SERVER_KEY, actorEmail: editor.email };

const expectRefusal = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(PostgresError);
  expect((error as PostgresError<{ code: string }>).data.code).toBe(code);
};

describe("inviteCodes", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    vi.useRealTimers();
  });

  describe("inviteCodeStatus", () => {
    it("derives revoked over exhausted over expired over active", () => {
      const base = activeCode();
      expect(inviteCodeStatus(base, NOW)).toBe("active");
      expect(inviteCodeStatus({ ...base, expiresAt: "2026-09-02T00:00:00.000Z" }, NOW)).toBe("expired");
      expect(
        inviteCodeStatus(
          { ...base, expiresAt: "2026-09-02T00:00:00.000Z", redemptions: [{ email: "x", at: "y" }] },
          NOW,
        ),
      ).toBe("exhausted");
      expect(
        inviteCodeStatus(
          { ...base, redemptions: [{ email: "x", at: "y" }], revokedAt: "2026-09-02T00:00:00.000Z" },
          NOW,
        ),
      ).toBe("revoked");
    });
  });

  describe("mint", () => {
    it("refuses an editor actor before touching the table", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin, editor] });
      await expect(mintHandler(ctx, { ...asEditor, role: "editor", codeHash: HASH_A })).rejects.toThrow(
        "Admin access required",
      );
      expect(tables.inviteCodes.size).toBe(0);
    });

    it("stores the hash with defaults of 7 days and one use, stamped by the actor, and returns the hashless summary", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin] });

      const summary = (await mintHandler(ctx, {
        ...asAdmin,
        role: "contributor",
        codeHash: HASH_A,
        note: "  Ada  ",
      })) as { id: string };
      const row = tables.inviteCodes.get(summary.id)!;

      expect(row).toMatchObject({
        codeHash: HASH_A,
        role: "contributor",
        createdBy: admin.email,
        createdAt: "2026-09-03T12:00:00.000Z",
        expiresAt: "2026-09-10T12:00:00.000Z",
        maxUses: 1,
        redemptions: [],
        note: "Ada",
      });
      expect(summary).toEqual({
        id: row._id,
        role: "contributor",
        glossaryLocales: [],
        createdBy: admin.email,
        createdAt: "2026-09-03T12:00:00.000Z",
        expiresAt: "2026-09-10T12:00:00.000Z",
        maxUses: 1,
        redemptions: [],
        revokedAt: undefined,
        note: "Ada",
        status: "active",
      });
    });

    it("honours explicit expiry and uses, and rejects out-of-range values", async () => {
      const { ctx } = createCtx({ memberships: [admin] });

      await expect(
        mintHandler(ctx, {
          ...asAdmin,
          role: "editor",
          codeHash: HASH_A,
          expiresInDays: 30,
          maxUses: 5,
        }),
      ).resolves.toMatchObject({
        expiresAt: "2026-10-03T12:00:00.000Z",
        maxUses: 5,
      });

      await expectRefusal(
        mintHandler(ctx, { ...asAdmin, role: "editor", codeHash: HASH_B, expiresInDays: 0 }),
        "INVITE_EXPIRY_INVALID",
      );
      await expectRefusal(
        mintHandler(ctx, { ...asAdmin, role: "editor", codeHash: HASH_B, maxUses: 1.5 }),
        "INVITE_USES_INVALID",
      );
      await expectRefusal(mintHandler(ctx, { ...asAdmin, role: "editor", codeHash: "nope" }), "INVITE_HASH_INVALID");
    });

    it("refuses a hash that already exists", async () => {
      const { ctx } = createCtx({ memberships: [admin], inviteCodes: [activeCode()] });
      await expectRefusal(mintHandler(ctx, { ...asAdmin, role: "editor", codeHash: HASH_A }), "INVITE_HASH_TAKEN");
    });
  });

  describe("list", () => {
    it("refuses an editor", async () => {
      const { ctx } = createCtx({ memberships: [admin, editor] });
      await expect(listHandler(ctx, asEditor)).rejects.toThrow("Admin access required");
    });

    it("returns newest first with a derived status and never the hash", async () => {
      const { ctx } = createCtx({
        memberships: [admin],
        inviteCodes: [
          activeCode({ _id: "inv1", createdAt: "2026-09-01T00:00:00.000Z" }),
          activeCode({
            _id: "inv2",
            codeHash: HASH_B,
            createdAt: "2026-09-02T00:00:00.000Z",
            revokedAt: "2026-09-02T01:00:00.000Z",
          }),
        ],
      });

      const result = (await listHandler(ctx, asAdmin)) as {
        invites: Record<string, unknown>[];
        continuationCursor: string | null;
      };
      const rows = result.invites;

      expect(rows.map((row) => row.id)).toEqual(["inv2", "inv1"]);
      expect(rows.map((row) => row.status)).toEqual(["revoked", "active"]);
      expect(result.continuationCursor).toBeNull();
      for (const row of rows) {
        expect(row).not.toHaveProperty("codeHash");
      }
    });
  });

  describe("revoke", () => {
    it("refuses an editor", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin, editor], inviteCodes: [activeCode()] });
      await expect(revokeHandler(ctx, { ...asEditor, id: "inv1" })).rejects.toThrow("Admin access required");
      expect(tables.inviteCodes.get("inv1")!.revokedAt).toBeUndefined();
    });

    it("stamps revokedAt on an active code and is idempotent", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin], inviteCodes: [activeCode()] });

      await revokeHandler(ctx, { ...asAdmin, id: "inv1" });
      expect(tables.inviteCodes.get("inv1")!.revokedAt).toBe("2026-09-03T12:00:00.000Z");

      vi.setSystemTime(NOW + 60_000);
      await revokeHandler(ctx, { ...asAdmin, id: "inv1" });
      expect(tables.inviteCodes.get("inv1")!.revokedAt).toBe("2026-09-03T12:00:00.000Z");
    });

    it("refuses a fully redeemed code and an unknown id", async () => {
      const { ctx } = createCtx({
        memberships: [admin],
        inviteCodes: [activeCode({ redemptions: [{ email: "x@example.com", at: "2026-09-02T00:00:00.000Z" }] })],
      });
      await expectRefusal(revokeHandler(ctx, { ...asAdmin, id: "inv1" }), "INVITE_EXHAUSTED");
      await expectRefusal(revokeHandler(ctx, { ...asAdmin, id: "inv9" }), "INVITE_UNKNOWN");
    });
  });

  describe("redeem", () => {
    const redeemArgs = (overrides: Record<string, unknown> = {}) => ({
      apiKey: SERVER_KEY,
      codeHash: HASH_A,
      username: "Ada",
      passwordHash: STORED_HASH,
      ...overrides,
    });

    it("refuses a caller without the server key", async () => {
      const { ctx } = createCtx({ memberships: [admin], inviteCodes: [activeCode()] });
      await expect(redeemHandler(ctx, redeemArgs({ apiKey: "wrong" }))).rejects.toThrow();
    });

    it("refuses an unknown code", async () => {
      const { ctx } = createCtx({ memberships: [admin] });
      await expectRefusal(redeemHandler(ctx, redeemArgs()), "INVITE_UNKNOWN");
    });

    it("refuses a revoked code", async () => {
      const { ctx } = createCtx({
        memberships: [admin],
        inviteCodes: [activeCode({ revokedAt: "2026-09-02T00:00:00.000Z" })],
      });
      await expectRefusal(redeemHandler(ctx, redeemArgs()), "INVITE_REVOKED");
    });

    it("refuses an expired code", async () => {
      const { ctx } = createCtx({
        memberships: [admin],
        inviteCodes: [activeCode({ expiresAt: "2026-09-03T11:59:59.000Z" })],
      });
      await expectRefusal(redeemHandler(ctx, redeemArgs()), "INVITE_EXPIRED");
    });

    it("refuses an exhausted code", async () => {
      const { ctx } = createCtx({
        memberships: [admin],
        inviteCodes: [activeCode({ redemptions: [{ email: "x@example.com", at: "2026-09-02T00:00:00.000Z" }] })],
      });
      await expectRefusal(redeemHandler(ctx, redeemArgs()), "INVITE_EXHAUSTED");
    });

    it("refuses a taken username before recording the redemption", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin, editor], inviteCodes: [activeCode()] });

      await expectRefusal(redeemHandler(ctx, redeemArgs({ username: " EDITOR " })), "USERNAME_TAKEN");

      expect(tables.inviteCodes.get("inv1")!.redemptions).toEqual([]);
      expect(tables.memberships.size).toBe(2);
    });

    it("refuses a taken email before recording the redemption", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin, editor], inviteCodes: [activeCode()] });

      await expectRefusal(
        redeemHandler(ctx, redeemArgs({ username: "ada", email: "Editor@Example.com" })),
        "EMAIL_TAKEN",
      );

      expect(tables.inviteCodes.get("inv1")!.redemptions).toEqual([]);
      expect(tables.memberships.size).toBe(2);
    });

    it("creates the membership at the code's role and appends the redemption", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin], inviteCodes: [activeCode({ role: "contributor" })] });

      const result = await redeemHandler(ctx, redeemArgs({ name: " Ada Lovelace " }));

      expect(result).toEqual({ email: "ada@members.dose.wiki", role: "contributor" });
      const created = [...tables.memberships.values()].find((row) => row.username === "ada");
      expect(created).toMatchObject({
        email: "ada@members.dose.wiki",
        username: "ada",
        role: "contributor",
        name: "Ada Lovelace",
        passwordHash: STORED_HASH,
        passwordUpdatedAt: "2026-09-03T12:00:00.000Z",
        invitedBy: admin.email,
        inviteCodeId: "inv1",
        createdAt: "2026-09-03T12:00:00.000Z",
        updatedAt: "2026-09-03T12:00:00.000Z",
        lastSeenAt: "2026-09-03T12:00:00.000Z",
      });
      expect(tables.inviteCodes.get("inv1")!.redemptions).toEqual([
        { email: "ada@members.dose.wiki", at: "2026-09-03T12:00:00.000Z" },
      ]);
    });

    it("carries the invitation's exact language grant into the account and gives legacy translators no implicit grant", async () => {
      for (const glossaryLocales of [["nl"], undefined]) {
        const { ctx, tables } = createCtx({ memberships: [admin], inviteCodes: [activeCode({ role: "editor_translator", glossaryLocales })] });
        await redeemHandler(ctx, redeemArgs());
        const created = [...tables.memberships.values()].find((row) => row.username === "ada");
        expect(created).toMatchObject({ role: "editor_translator", glossaryLocales: glossaryLocales ?? [] });
      }
    });

    it("uses the supplied email, normalized, and allows a multi-use code until exhausted", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin], inviteCodes: [activeCode({ maxUses: 2 })] });

      await redeemHandler(ctx, redeemArgs({ username: "ada", email: " Ada@Example.COM " }));
      await redeemHandler(ctx, redeemArgs({ username: "grace" }));
      await expectRefusal(redeemHandler(ctx, redeemArgs({ username: "linus" })), "INVITE_EXHAUSTED");

      expect(tables.inviteCodes.get("inv1")!.redemptions.map((entry) => entry.email)).toEqual([
        "ada@example.com",
        "grace@members.dose.wiki",
      ]);
    });
  });
});
