import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ban,
  consumePasswordReset,
  getByEmail,
  getCredentialsByUsername,
  issuePasswordReset,
  listRoster,
  retireViewerMemberships,
  setAdminAccount,
  setRole,
  touchSignIn,
  unban,
} from "../convex/memberships";

const SERVER_KEY = "test-admin-key";

type Row = {
  _id: string;
  email: string;
  username?: string;
  role: "admin" | "editor" | "contributor" | "viewer";
  name?: string;
  passwordHash?: string;
  passwordUpdatedAt?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
  invitedBy?: string;
  bannedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
};

/**
 * In-memory memberships table supporting the indexes the module uses
 * (`by_email`, `by_username`, `by_role`, `by_reset_token_hash`) plus an
 * unindexed `collect` for the roster. `requireRole` reads `by_email` too.
 */
function createCtx(seed: Row[]) {
  const rows = new Map(seed.map((row) => [row._id, { ...row }]));
  let nextId = seed.length + 1;

  const query = (_table: string) => ({
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
      const matches = () => [...rows.values()].filter((row) => row[field as keyof Row] === value);
      return {
        unique: async () => {
          const found = matches();
          if (found.length > 1) {
            throw new Error(`${indexName} returned ${found.length} rows`);
          }
          return found[0] ?? null;
        },
        collect: async () => matches(),
      };
    },
    collect: async () => [...rows.values()],
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        normalizeId: () => null, // This fixture contains membership rows only.
        query: vi.fn(query),
        patch: vi.fn(async (id: string, patch: Partial<Row>) => {
          const next = { ...rows.get(id)!, ...patch };
          for (const key of Object.keys(patch) as (keyof Row)[]) {
            if (patch[key] === undefined) {
              delete next[key];
            }
          }
          rows.set(id, next);
        }),
        insert: vi.fn(async (_table: string, doc: Omit<Row, "_id">) => {
          const _id = `m${nextId++}`;
          rows.set(_id, { _id, ...doc });
          return _id;
        }),
        delete: vi.fn(async (id: string) => {
          rows.delete(id);
        }),
      },
    } as never,
    rows,
  };
}

type Handler = (ctx: never, args: unknown) => Promise<unknown>;
const handlerOf = (fn: unknown) => (fn as { _handler: Handler })._handler;

/** The registered function's args validator as Convex exports it (JSON). */
function argsSchemaOf(fn: unknown): string {
  if (typeof fn === "function" && "exportArgs" in fn && typeof fn.exportArgs === "function") {
    return String(fn.exportArgs());
  }
  throw new Error("not a registered Convex function");
}

/** The registered function's returns validator as Convex exports it (JSON). */
function returnsSchemaOf(fn: unknown): string {
  if (typeof fn === "function" && "exportReturns" in fn && typeof fn.exportReturns === "function") {
    return String(fn.exportReturns());
  }
  throw new Error("not a registered Convex function");
}

const byEmailHandler = handlerOf(getByEmail);
const credentialsHandler = handlerOf(getCredentialsByUsername);
const touchHandler = handlerOf(touchSignIn);
const setAdminHandler = handlerOf(setAdminAccount);
const retireHandler = handlerOf(retireViewerMemberships);
const rosterHandler = handlerOf(listRoster);
const setRoleHandler = handlerOf(setRole);
const banHandler = handlerOf(ban);
const unbanHandler = handlerOf(unban);
const issueResetHandler = handlerOf(issuePasswordReset);
const consumeResetHandler = handlerOf(consumePasswordReset);

const josie: Row = {
  _id: "m1",
  email: "josie@example.com",
  username: "josie",
  role: "admin",
  name: "Josie",
  passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("memberships account functions", () => {
  beforeEach(() => {
    process.env.CONVEX_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
  });

  describe("getByEmail", () => {
    it("refuses a caller without the server key", async () => {
      const { ctx } = createCtx([josie]);
      await expect(byEmailHandler(ctx, { apiKey: "wrong", email: "josie@example.com" })).rejects.toThrow();
    });

    it("looks up by normalized email and returns the session fields only, never hashes or tokens", async () => {
      const bannedAt = "2026-08-01T00:00:00.000Z";
      const { ctx } = createCtx([
        { ...josie, bannedAt, resetTokenHash: "abc", resetTokenExpiresAt: "2099-01-01T00:00:00.000Z" },
      ]);

      await expect(byEmailHandler(ctx, { apiKey: SERVER_KEY, email: "  JOSIE@Example.com " })).resolves.toEqual({
        email: "josie@example.com",
        username: "josie",
        role: "admin",
        name: "Josie",
        image: undefined,
        bannedAt,
      });
      await expect(byEmailHandler(ctx, { apiKey: SERVER_KEY, email: "nobody@example.com" })).resolves.toBeNull();
    });

    it("declares a returns validator that excludes passwordHash and the reset token", () => {
      const returns = returnsSchemaOf(getByEmail);
      expect(returns).toContain('"bannedAt"');
      expect(returns).not.toContain("passwordHash");
      expect(returns).not.toContain("resetTokenHash");
    });
  });

  describe("getCredentialsByUsername", () => {
    it("refuses a caller without the server key", async () => {
      const { ctx } = createCtx([josie]);
      await expect(credentialsHandler(ctx, { apiKey: "wrong", username: "josie" })).rejects.toThrow();
      await expect(credentialsHandler(ctx, { apiKey: "", username: "josie" })).rejects.toThrow();
    });

    it("looks up by normalized username and returns only the sign-in fields", async () => {
      const { ctx } = createCtx([josie]);

      await expect(credentialsHandler(ctx, { apiKey: SERVER_KEY, username: "  JOSIE " })).resolves.toEqual({
        email: "josie@example.com",
        role: "admin",
        name: "Josie",
        passwordHash: josie.passwordHash,
        bannedAt: undefined,
      });
    });

    it("returns null for an unknown username", async () => {
      const { ctx } = createCtx([josie]);
      await expect(credentialsHandler(ctx, { apiKey: SERVER_KEY, username: "nobody" })).resolves.toBeNull();
    });

    it("still returns a banned row, carrying bannedAt", async () => {
      const bannedAt = "2026-08-01T00:00:00.000Z";
      const { ctx } = createCtx([{ ...josie, bannedAt }]);

      await expect(credentialsHandler(ctx, { apiKey: SERVER_KEY, username: "josie" })).resolves.toMatchObject({
        email: "josie@example.com",
        bannedAt,
      });
    });
  });

  describe("touchSignIn", () => {
    it("stamps lastSeenAt on the matching row and ignores unknown emails", async () => {
      const { ctx, rows } = createCtx([josie]);

      await touchHandler(ctx, { apiKey: SERVER_KEY, email: "JOSIE@example.com" });
      expect(rows.get("m1")?.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      await touchHandler(ctx, { apiKey: SERVER_KEY, email: "nobody@example.com" });
      expect(rows.size).toBe(1);
    });
  });

  describe("setAdminAccount", () => {
    it("inserts a new admin row keyed by normalized username and email", async () => {
      const { ctx, rows } = createCtx([]);

      const result = await setAdminHandler(ctx, {
        apiKey: SERVER_KEY,
        username: " Lyrea ",
        email: "Lyrea@Example.com",
        name: " Lyrea ",
        passwordHash: "scrypt$hash",
      });

      expect(result).toEqual({ membershipId: "m1", created: true });
      expect(rows.get("m1")).toMatchObject({
        username: "lyrea",
        email: "lyrea@example.com",
        name: "Lyrea",
        role: "admin",
        passwordHash: "scrypt$hash",
      });
      expect(rows.get("m1")?.createdAt).toBeTruthy();
      expect(rows.get("m1")?.passwordUpdatedAt).toBeTruthy();
    });

    it("upserts an existing username: rotates the password, forces admin, keeps the row", async () => {
      const { ctx, rows } = createCtx([{ ...josie, role: "editor" }]);

      const result = await setAdminHandler(ctx, {
        apiKey: SERVER_KEY,
        username: "josie",
        email: "josie@example.com",
        name: "Josie K",
        passwordHash: "scrypt$rotated",
      });

      expect(result).toEqual({ membershipId: "m1", created: false });
      expect(rows.size).toBe(1);
      expect(rows.get("m1")).toMatchObject({
        role: "admin",
        name: "Josie K",
        passwordHash: "scrypt$rotated",
        createdAt: josie.createdAt,
      });
    });

    it("attaches a username to an existing email-only row instead of duplicating it", async () => {
      const { ctx, rows } = createCtx([{ ...josie, username: undefined }]);

      await setAdminHandler(ctx, {
        apiKey: SERVER_KEY,
        username: "josie",
        email: "josie@example.com",
        name: "Josie",
        passwordHash: "scrypt$hash",
      });

      expect(rows.size).toBe(1);
      expect(rows.get("m1")?.username).toBe("josie");
    });

    it("refuses when the username and email belong to different rows", async () => {
      const { ctx } = createCtx([
        josie,
        { _id: "m2", email: "other@example.com", username: "other", role: "editor" },
      ]);

      await expect(
        setAdminHandler(ctx, {
          apiKey: SERVER_KEY,
          username: "josie",
          email: "other@example.com",
          name: "Josie",
          passwordHash: "scrypt$hash",
        }),
      ).rejects.toThrow(/different memberships/);
    });

    it("refuses blank fields and callers without the server key", async () => {
      const { ctx } = createCtx([]);

      await expect(
        setAdminHandler(ctx, { apiKey: SERVER_KEY, username: " ", email: "a@b.c", name: "A", passwordHash: "x" }),
      ).rejects.toThrow(/required/);
      await expect(
        setAdminHandler(ctx, { apiKey: "nope", username: "a", email: "a@b.c", name: "A", passwordHash: "x" }),
      ).rejects.toThrow();
    });
  });

  describe("retireViewerMemberships", () => {
    it("deletes viewer rows without a username and keeps everything else", async () => {
      const { ctx, rows } = createCtx([
        josie,
        { _id: "m2", email: "oauth@example.com", role: "viewer" },
        { _id: "m3", email: "kept@example.com", username: "kept", role: "viewer" },
        { _id: "m4", email: "editor@example.com", role: "editor" },
      ]);

      await expect(retireHandler(ctx, { apiKey: SERVER_KEY })).resolves.toEqual({ deleted: 1 });
      expect([...rows.keys()].sort()).toEqual(["m1", "m3", "m4"]);
    });
  });

  const ada: Row = {
    _id: "m2",
    email: "ada@example.com",
    username: "ada",
    role: "editor",
    name: "Ada",
    passwordHash: "scrypt$ada",
    invitedBy: "josie@example.com",
    lastSeenAt: "2026-08-02T00:00:00.000Z",
  };
  const otherAdmin: Row = {
    _id: "m3",
    email: "lyrea@example.com",
    username: "lyrea",
    role: "admin",
    passwordHash: "scrypt$lyrea",
  };
  const asJosie = { apiKey: SERVER_KEY, actorEmail: "josie@example.com" };

  describe("listRoster", () => {
    it("refuses an editor actor", async () => {
      const { ctx } = createCtx([josie, ada]);
      await expect(
        rosterHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "ada@example.com" }),
      ).rejects.toThrow(/Admin access required/);
    });

    it("returns every row with only the roster fields, never hashes or tokens", async () => {
      const { ctx } = createCtx([
        josie,
        { ...ada, resetTokenHash: "abc", resetTokenExpiresAt: "2099-01-01T00:00:00.000Z" },
      ]);

      const roster = (await rosterHandler(ctx, asJosie)) as Record<string, unknown>[];
      expect(roster).toHaveLength(2);
      expect(roster[1]).toEqual({
        email: "ada@example.com",
        username: "ada",
        name: "Ada",
        role: "editor",
        createdAt: undefined,
        lastSeenAt: ada.lastSeenAt,
        bannedAt: undefined,
        invitedBy: "josie@example.com",
        inviteCodeId: undefined,
      });
      for (const row of roster) {
        expect(row).not.toHaveProperty("passwordHash");
        expect(row).not.toHaveProperty("resetTokenHash");
        expect(row).not.toHaveProperty("resetTokenExpiresAt");
      }
    });
  });

  describe("setRole", () => {
    it("changes a non-admin row's role", async () => {
      const { ctx, rows } = createCtx([josie, ada]);
      await setRoleHandler(ctx, { ...asJosie, email: "ADA@example.com", role: "contributor" });
      expect(rows.get("m2")?.role).toBe("contributor");
    });

    it("refuses self, admin targets, unknown rows, and granting admin", async () => {
      const { ctx, rows } = createCtx([josie, ada, otherAdmin]);

      await expect(
        setRoleHandler(ctx, { ...asJosie, email: "josie@example.com", role: "editor" }),
      ).rejects.toThrow(/your own membership/);
      await expect(
        setRoleHandler(ctx, { ...asJosie, email: "lyrea@example.com", role: "editor" }),
      ).rejects.toThrow(/Admin accounts/);
      await expect(
        setRoleHandler(ctx, { ...asJosie, email: "nobody@example.com", role: "editor" }),
      ).rejects.toThrow(/No membership/);
      // The validator refuses `admin` before the handler runs; the exported
      // args validator is the contract, so assert on it directly.
      const roleValidator = argsSchemaOf(setRole);
      expect(roleValidator).toContain('"editor"');
      expect(roleValidator).toContain('"contributor"');
      expect(roleValidator).not.toContain('"admin"');
      expect(rows.get("m3")?.role).toBe("admin");
      expect(rows.get("m2")?.role).toBe("editor");
    });

    it("refuses an editor actor before touching the row", async () => {
      const { ctx, rows } = createCtx([josie, ada, { ...ada, _id: "m4", email: "b@example.com", username: "b" }]);
      await expect(
        setRoleHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "ada@example.com", email: "b@example.com", role: "contributor" }),
      ).rejects.toThrow(/Admin access required/);
      expect(rows.get("m4")?.role).toBe("editor");
    });
  });

  describe("ban and unban", () => {
    it("stamps and clears bannedAt on a non-admin row", async () => {
      const { ctx, rows } = createCtx([josie, ada]);

      await banHandler(ctx, { ...asJosie, email: "ada@example.com" });
      expect(rows.get("m2")?.bannedAt).toMatch(/^\d{4}-/);

      await unbanHandler(ctx, { ...asJosie, email: "ada@example.com" });
      expect(rows.get("m2")).not.toHaveProperty("bannedAt");
    });

    it("refuses self and admin targets", async () => {
      const { ctx, rows } = createCtx([josie, otherAdmin]);
      await expect(banHandler(ctx, { ...asJosie, email: "josie@example.com" })).rejects.toThrow(/your own/);
      await expect(banHandler(ctx, { ...asJosie, email: "lyrea@example.com" })).rejects.toThrow(/Admin accounts/);
      await expect(unbanHandler(ctx, { ...asJosie, email: "lyrea@example.com" })).rejects.toThrow(/Admin accounts/);
      expect(rows.get("m3")).not.toHaveProperty("bannedAt");
    });
  });

  describe("issuePasswordReset", () => {
    it("stores the hash with a one-hour expiry", async () => {
      const { ctx, rows } = createCtx([josie, ada]);
      const before = Date.now();

      await expect(issueResetHandler(ctx, { ...asJosie, email: "ada@example.com", tokenHash: "deadbeef" })).resolves.toBeNull();

      const row = rows.get("m2")!;
      expect(row.resetTokenHash).toBe("deadbeef");
      const expires = Date.parse(row.resetTokenExpiresAt!);
      expect(expires - before).toBeGreaterThanOrEqual(60 * 60 * 1000 - 50);
      expect(expires - before).toBeLessThan(60 * 60 * 1000 + 5_000);
    });

    it("refuses self, admin targets, and an empty hash", async () => {
      const { ctx, rows } = createCtx([josie, ada, otherAdmin]);
      await expect(issueResetHandler(ctx, { ...asJosie, email: "josie@example.com", tokenHash: "x" })).rejects.toThrow(/your own/);
      await expect(issueResetHandler(ctx, { ...asJosie, email: "lyrea@example.com", tokenHash: "x" })).rejects.toThrow(/Admin accounts/);
      await expect(issueResetHandler(ctx, { ...asJosie, email: "ada@example.com", tokenHash: "" })).rejects.toThrow(/required/);
      expect(rows.get("m2")).not.toHaveProperty("resetTokenHash");
    });

    it("refuses a banned member and leaves no token behind", async () => {
      const { ctx, rows } = createCtx([josie, { ...ada, bannedAt: "2026-08-01T00:00:00.000Z" }]);
      await expect(
        issueResetHandler(ctx, { ...asJosie, email: "ada@example.com", tokenHash: "deadbeef" }),
      ).rejects.toMatchObject({ data: { code: "MEMBER_BANNED" } });
      expect(rows.get("m2")).not.toHaveProperty("resetTokenHash");
    });
  });

  describe("consumePasswordReset", () => {
    const pending = {
      ...ada,
      resetTokenHash: "deadbeef",
      resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    it("rotates the password and clears the token for a live hash", async () => {
      const { ctx, rows } = createCtx([pending]);

      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "deadbeef", passwordHash: "scrypt$new" }),
      ).resolves.toBeNull();

      const row = rows.get("m2")!;
      expect(row.passwordHash).toBe("scrypt$new");
      expect(row.passwordUpdatedAt).toMatch(/^\d{4}-/);
      expect(row).not.toHaveProperty("resetTokenHash");
      expect(row).not.toHaveProperty("resetTokenExpiresAt");

      // The same link cannot be used twice.
      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "deadbeef", passwordHash: "scrypt$again" }),
      ).rejects.toThrow(/invalid or has expired/);
    });

    it("refuses an expired token and leaves the password alone", async () => {
      const { ctx, rows } = createCtx([
        { ...pending, resetTokenExpiresAt: new Date(Date.now() - 1000).toISOString() },
      ]);
      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "deadbeef", passwordHash: "scrypt$new" }),
      ).rejects.toThrow(/invalid or has expired/);
      expect(rows.get("m2")?.passwordHash).toBe("scrypt$ada");
    });

    it("refuses a live token whose member was banned after it was issued", async () => {
      const { ctx, rows } = createCtx([{ ...pending, bannedAt: "2026-08-01T00:00:00.000Z" }]);
      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "deadbeef", passwordHash: "scrypt$new" }),
      ).rejects.toThrow(/invalid or has expired/);
      expect(rows.get("m2")?.passwordHash).toBe("scrypt$ada");
      expect(rows.get("m2")?.resetTokenHash).toBe("deadbeef");
    });

    it("refuses an unknown token, a blank token, and a caller without the server key", async () => {
      const { ctx } = createCtx([pending]);
      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "nope", passwordHash: "scrypt$new" }),
      ).rejects.toThrow(/invalid or has expired/);
      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "", passwordHash: "scrypt$new" }),
      ).rejects.toThrow(/required/);
      await expect(
        consumeResetHandler(ctx, { apiKey: "wrong", tokenHash: "deadbeef", passwordHash: "scrypt$new" }),
      ).rejects.toThrow();
    });
  });
});
