import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ban,
  consumePasswordReset,
  getByEmail,
  getCredentialsByUsername,
  issuePasswordReset,
  listRoster,
  renameAccount,
  setAdminAccount,
  setRole,
  unban,
} from "../server/memberships";

import { createCtx, type Row } from "./dataMembershipAccounts.testHarness";

const SERVER_KEY = "test-admin-key";

type Handler = (ctx: never, args: unknown) => Promise<unknown>;
const handlerOf = (fn: unknown) => (fn as { _handler: Handler })._handler;

const byEmailHandler = handlerOf(getByEmail);
const credentialsHandler = handlerOf(getCredentialsByUsername);
const setAdminHandler = handlerOf(setAdminAccount);
const rosterHandler = handlerOf(listRoster);
const setRoleHandler = handlerOf(setRole);
const banHandler = handlerOf(ban);
const unbanHandler = handlerOf(unban);
const issueResetHandler = handlerOf(issuePasswordReset);
const consumeResetHandler = handlerOf(consumePasswordReset);
const renameHandler = handlerOf(renameAccount);

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
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
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
  });

  describe("getCredentialsByUsername", () => {
    it("refuses a caller without the server key", async () => {
      const { ctx } = createCtx([josie]);
      await expect(credentialsHandler(ctx, { apiKey: "wrong", username: "josie" })).rejects.toThrow();
      await expect(credentialsHandler(ctx, { apiKey: "", username: "josie" })).rejects.toThrow();
    });
  });

  describe("setAdminAccount", () => {
    it("advances the password revision when two rotations share a millisecond", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
      try {
        const { ctx, rows } = createCtx([josie]);
        const args = { apiKey: SERVER_KEY, username: "josie", email: josie.email, name: "Josie", passwordHash: "scrypt$first" };
        await setAdminHandler(ctx, args);
        const firstRevision = rows.get("m1")?.passwordUpdatedAt;
        await setAdminHandler(ctx, { ...args, passwordHash: "scrypt$second" });
        expect(rows.get("m1")?.passwordUpdatedAt).not.toBe(firstRevision);
      } finally {
        vi.useRealTimers();
      }
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

    it("never returns hashes or tokens in the roster", async () => {
      const { ctx } = createCtx([
        josie,
        { ...ada, resetTokenHash: "abc", resetTokenExpiresAt: "2099-01-01T00:00:00.000Z" },
      ]);

      const roster = (await rosterHandler(ctx, asJosie)) as Record<string, unknown>[];
      for (const row of roster) {
        expect(row).not.toHaveProperty("passwordHash");
        expect(row).not.toHaveProperty("resetTokenHash");
        expect(row).not.toHaveProperty("resetTokenExpiresAt");
      }
    });
  });

  describe("setRole", () => {
    it("persists both capabilities and replaces scope atomically without changing identity", async () => {
      const { ctx, rows } = createCtx([josie, ada]);
      await setRoleHandler(ctx, { ...asJosie, email: ada.email, role: "editor_translator", glossaryLocales: ["nl"] });
      expect(rows.get("m2")).toMatchObject({ email: ada.email, username: ada.username, passwordHash: ada.passwordHash, role: "editor_translator", glossaryLocales: ["nl"] });
      await expect(byEmailHandler(ctx, { apiKey: SERVER_KEY, email: ada.email })).resolves.toMatchObject({ role: "editor_translator", glossaryLocales: ["nl"] });
      await expect(setRoleHandler(ctx, { ...asJosie, email: ada.email, role: "translator", glossaryLocales: ["unknown"] })).rejects.toThrow();
      expect(rows.get("m2")).toMatchObject({ role: "editor_translator", glossaryLocales: ["nl"] });
      await setRoleHandler(ctx, { ...asJosie, email: ada.email, role: "editor" });
      expect(rows.get("m2")).toMatchObject({ role: "editor", glossaryLocales: [] });
    });
    it("refuses self, admin targets, and unknown rows", async () => {
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
    it("refuses self and admin targets", async () => {
      const { ctx, rows } = createCtx([josie, otherAdmin]);
      await expect(banHandler(ctx, { ...asJosie, email: "josie@example.com" })).rejects.toThrow(/your own/);
      await expect(banHandler(ctx, { ...asJosie, email: "lyrea@example.com" })).rejects.toThrow(/Admin accounts/);
      await expect(unbanHandler(ctx, { ...asJosie, email: "lyrea@example.com" })).rejects.toThrow(/Admin accounts/);
      expect(rows.get("m3")).not.toHaveProperty("bannedAt");
    });
  });

  describe("issuePasswordReset", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stores the hash with a one-hour expiry", async () => {
      const { ctx, rows } = createCtx([josie, ada]);

      await expect(issueResetHandler(ctx, { ...asJosie, email: "ada@example.com", tokenHash: "deadbeef" })).resolves.toBeNull();

      const row = rows.get("m2")!;
      expect(row.resetTokenHash).toBe("deadbeef");
      const expires = Date.parse(row.resetTokenExpiresAt!);
      expect(expires).toBe(now.getTime() + 60 * 60 * 1000);
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
    const now = new Date("2026-09-01T12:00:00.000Z");
    const expiresAt = now.getTime() + 30 * 60 * 1000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const pending = {
      ...ada,
      resetTokenHash: "deadbeef",
      resetTokenExpiresAt: new Date(expiresAt).toISOString(),
    };

    it("advances the password revision across resets in the same millisecond", async () => {
      const { ctx, rows } = createCtx([pending]);
      await consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "deadbeef", passwordHash: "scrypt$first" });
      const firstRevision = rows.get("m2")?.passwordUpdatedAt;
      rows.set("m2", { ...rows.get("m2")!, resetTokenHash: "second", resetTokenExpiresAt: new Date(expiresAt).toISOString() });
      await consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "second", passwordHash: "scrypt$second" });
      expect(rows.get("m2")?.passwordUpdatedAt).not.toBe(firstRevision);
    });

    it("rotates the password just before expiry and prevents reuse", async () => {
      vi.setSystemTime(expiresAt - 1);
      const { ctx, rows } = createCtx([pending]);

      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "deadbeef", passwordHash: "scrypt$new" }),
      ).resolves.toBeNull();

      const row = rows.get("m2")!;
      expect(row.passwordHash).toBe("scrypt$new");
      expect(row.passwordUpdatedAt).toBe(new Date(expiresAt - 1).toISOString());
      expect(row).not.toHaveProperty("resetTokenHash");
      expect(row).not.toHaveProperty("resetTokenExpiresAt");

      // The same link cannot be used twice.
      await expect(
        consumeResetHandler(ctx, { apiKey: SERVER_KEY, tokenHash: "deadbeef", passwordHash: "scrypt$again" }),
      ).rejects.toThrow(/invalid or has expired/);
    });

    it.each([0, 1])("refuses the token %i ms after its expiry boundary without changing the password", async (offset) => {
      vi.setSystemTime(expiresAt + offset);
      const { ctx, rows } = createCtx([pending]);
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
  describe("renameAccount", () => {
    const old: Row = {
      _id: "m2",
      email: "old@local.dose.wiki",
      username: "old",
      role: "admin",
      name: "Old",
      passwordHash: "scrypt$16384$8$1$b2xk$aGFzaA==",
      passwordUpdatedAt: "2026-05-01T00:00:00.000Z",
      lastSeenAt: "2026-10-05T10:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const placeholder: Row = {
      _id: "m3",
      email: "new@local.dose.wiki",
      username: "new",
      role: "admin",
      name: "New",
      passwordHash: "scrypt$16384$8$1$bmV3$aGFzaA==",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const args = { apiKey: SERVER_KEY, fromUsername: "OLD", toUsername: "new", toEmail: "New@local.dose.wiki", toName: "New" };

    it("refuses a caller without the server key", async () => {
      const { ctx } = createCtx([josie, old]);
      await expect(renameHandler(ctx, { ...args, apiKey: "wrong" })).rejects.toThrow();
    });

    it("never removes an account that has signed in", async () => {
      const { ctx, rows } = createCtx([josie, old, { ...placeholder, lastSeenAt: "2026-09-01T00:00:00.000Z" }]);

      await expect(renameHandler(ctx, args)).rejects.toThrow(/live account/);
      expect(rows.get("m2")).toMatchObject({ username: "old", email: "old@local.dose.wiki" });
      expect(rows.has("m3")).toBe(true);
    });

    it("refuses an unknown or banned source", async () => {
      await expect(renameHandler(createCtx([josie]).ctx, args)).rejects.toThrow(/No account/);
      await expect(renameHandler(createCtx([josie, { ...old, bannedAt: "2026-09-01T00:00:00.000Z" }]).ctx, args)).rejects.toThrow(/banned/);
    });
  });
});
