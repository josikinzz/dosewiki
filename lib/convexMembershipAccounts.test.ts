import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCredentialsByUsername,
  retireViewerMemberships,
  setAdminAccount,
  touchSignIn,
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
  bannedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
};

/**
 * In-memory memberships table supporting the three indexes the module uses:
 * `by_email`, `by_username`, `by_role`. `requireRole` reads `by_email` too.
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
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        query: vi.fn(query),
        patch: vi.fn(async (id: string, patch: Partial<Row>) => {
          rows.set(id, { ...rows.get(id)!, ...patch });
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

const credentialsHandler = handlerOf(getCredentialsByUsername);
const touchHandler = handlerOf(touchSignIn);
const setAdminHandler = handlerOf(setAdminAccount);
const retireHandler = handlerOf(retireViewerMemberships);

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
});
