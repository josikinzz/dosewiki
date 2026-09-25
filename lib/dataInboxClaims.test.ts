/**
 * Inbox claims for items with no Reviewing status of their own: one admin
 * holds an item, another admin sees who, and only the holder releases it.
 * Drives the real handlers against the in-memory Postgres fixture.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimHandler, listClaimsHandler, releaseHandler } from "../server/inboxClaims";
import { SERVER_KEY, admin, createCtx, editor, type Row } from "./changeProposalReviewFixture";

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };
const asOtherAdmin = { apiKey: SERVER_KEY, actorEmail: "second@example.com" };
const asEditor = { apiKey: SERVER_KEY, actorEmail: "editor@example.com" };
const secondAdmin: Row = { ...admin, _id: "m2", email: "second@example.com" };

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
  delete process.env.DATA_WRITES_FROZEN;
});

describe("inbox claims", () => {
  it("records the claiming admin and shows it to another admin", async () => {
    const { ctx } = createCtx({ memberships: [admin, secondAdmin] });
    await claimHandler(ctx, { ...asAdmin, source: "proposals", item_id: "p1" });

    const seen = await listClaimsHandler(ctx, asOtherAdmin);
    expect(seen).toEqual([
      expect.objectContaining({ source: "proposals", item_id: "p1", claimed_by: "admin@example.com" }),
    ]);
  });

  it("refuses a claim another admin holds and keeps the holder", async () => {
    const { ctx } = createCtx({ memberships: [admin, secondAdmin] });
    await claimHandler(ctx, { ...asAdmin, source: "citations", item_id: "lsd" });

    await expect(
      claimHandler(ctx, { ...asOtherAdmin, source: "citations", item_id: "lsd" }),
    ).rejects.toMatchObject({ data: { code: "INBOX_CLAIM_HELD", claimedBy: "admin@example.com" } });
    // Claiming again as the holder is a no-op, not a second row.
    await claimHandler(ctx, { ...asAdmin, source: "citations", item_id: "lsd" });
    expect(await listClaimsHandler(ctx, asAdmin)).toHaveLength(1);
  });

  it("lets only the holder release a claim", async () => {
    const { ctx } = createCtx({ memberships: [admin, secondAdmin] });
    await claimHandler(ctx, { ...asAdmin, source: "review-recommendations", item_id: "lsd" });

    await expect(
      releaseHandler(ctx, { ...asOtherAdmin, source: "review-recommendations", item_id: "lsd" }),
    ).rejects.toMatchObject({ data: { code: "INBOX_CLAIM_HELD" } });
    await expect(
      releaseHandler(ctx, { ...asAdmin, source: "review-recommendations", item_id: "lsd" }),
    ).resolves.toEqual({ released: true });
    expect(await listClaimsHandler(ctx, asAdmin)).toEqual([]);
  });

  it("is admin only for reads and writes", async () => {
    const { ctx } = createCtx({ memberships: [admin, editor] });
    await expect(listClaimsHandler(ctx, asEditor)).rejects.toThrow("Admin access required");
    await expect(
      claimHandler(ctx, { ...asEditor, source: "proposals", item_id: "p1" }),
    ).rejects.toThrow("Admin access required");
  });

  it("fails closed while writes are frozen", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin] });
    process.env.DATA_WRITES_FROZEN = "1";
    await expect(claimHandler(ctx, { ...asAdmin, source: "proposals", item_id: "p1" })).rejects.toThrow();
    expect(rowsOf("inboxClaims").size).toBe(0);
  });
});
