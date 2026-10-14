import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresError } from "@server/postgres/runtime/values";
import { list, mint, redeem, revoke } from "../server/inviteCodes";

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
 * `inviteCodes` (by_code_hash).
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
      let rows = [...tables[table].values()] as Row[];
      if (field) {
        rows = rows.filter((row) => (row as Record<string, unknown>)[field] === value);
      }
      return {
        unique: async () => {
          if (rows.length > 1) {
            throw new Error(`${indexName} returned ${rows.length} rows`);
          }
          return rows[0] ?? null;
        },
      };
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

  describe("mint", () => {
    it("refuses an editor actor before touching the table", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin, editor] });
      await expect(mintHandler(ctx, { ...asEditor, role: "editor", codeHash: HASH_A })).rejects.toThrow(
        "Admin access required",
      );
      expect(tables.inviteCodes.size).toBe(0);
    });
  });

  describe("list", () => {
    it("refuses an editor", async () => {
      const { ctx } = createCtx({ memberships: [admin, editor] });
      await expect(listHandler(ctx, asEditor)).rejects.toThrow("Admin access required");
    });
  });

  describe("revoke", () => {
    it("refuses an editor", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin, editor], inviteCodes: [activeCode()] });
      await expect(revokeHandler(ctx, { ...asEditor, id: "inv1" })).rejects.toThrow("Admin access required");
      expect(tables.inviteCodes.get("inv1")!.revokedAt).toBeUndefined();
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

    it("refuses a supplied address in the synthetic members domain before recording anything", async () => {
      const { ctx, tables } = createCtx({ memberships: [admin], inviteCodes: [activeCode({ maxUses: 3 })] });

      for (const email of ["grace@members.dose.wiki", " Grace@Members.Dose.Wiki ", "grace@mail.members.dose.wiki"]) {
        await expectRefusal(redeemHandler(ctx, redeemArgs({ username: "ada", email })), "EMAIL_RESERVED");
      }

      expect(tables.inviteCodes.get("inv1")!.redemptions).toEqual([]);
      expect(tables.memberships.size).toBe(1);
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
