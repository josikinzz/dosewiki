/**
 * Inbox claims for items with no Reviewing status of their own: one admin
 * holds an item, another admin sees who, only the holder releases it, another
 * admin may take it over, and deciding the item ends its claim.
 * Drives the real handlers against the in-memory Postgres fixture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setManyStatusHandler } from "../server/citationEvidence";
import { rejectHandler } from "../server/changeProposalReview";
import { claimHandler, listClaimsHandler, releaseHandler, takeOverHandler } from "../server/inboxClaims";
import {
  approveReviewRecommendationsHandler,
  recommendEditorialReviewHandler,
} from "../server/lib/substanceReviewHandlers";
import { INBOX_CLAIM_EXPIRY_MS } from "../server/lib/inboxClaimSources";
import { REVIEW_INITIAL_REVISION } from "../src/schema/substance/editorial";
import { SERVER_KEY, admin, createCtx, editor, proposalRow, storedLsd, type Row } from "./changeProposalReviewFixture";

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
  vi.useRealTimers();
});

function evidenceRow(claimKey: string, status: string): Row {
  return {
    _id: `ev_${claimKey}`,
    slug: "lsd",
    section: "summary",
    claimKey,
    fieldPath: "summary",
    claimText: "LSD is a hallucinogen.",
    entailmentVerdict: "entails",
    referenceIds: ["ref1"],
    supports: [{
      sourceId: "src1",
      sourceName: "Source",
      referenceId: "ref1",
      supportingQuote: "Quoted support.",
      rationale: "Says so.",
      verifiedQuote: { sourceId: "src1", matchType: "exact", startOffset: 0, endOffset: 15 },
    }],
    status,
    severity: "non_blocking",
  };
}

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
    const { ctx, rowsOf } = createCtx({ memberships: [admin, secondAdmin] });
    await claimHandler(ctx, { ...asAdmin, source: "proposals", item_id: "p0" });
    process.env.DATA_WRITES_FROZEN = "1";
    await expect(claimHandler(ctx, { ...asAdmin, source: "proposals", item_id: "p1" })).rejects.toThrow();
    await expect(takeOverHandler(ctx, { ...asOtherAdmin, source: "proposals", item_id: "p0" })).rejects.toThrow();
    expect([...rowsOf("inboxClaims").values()]).toEqual([
      expect.objectContaining({ item_id: "p0", claimed_by: "admin@example.com" }),
    ]);
  });

  it("lets another admin take over a claim, recorded with the new claimer", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, secondAdmin, editor] });
    await claimHandler(ctx, { ...asAdmin, source: "proposals", item_id: "p1" });

    const taken = await takeOverHandler(ctx, { ...asOtherAdmin, source: "proposals", item_id: "p1" });

    expect(taken).toMatchObject({ source: "proposals", item_id: "p1", claimed_by: "second@example.com" });
    expect([...rowsOf("inboxClaims").values()]).toEqual([
      expect.objectContaining({ item_id: "p1", claimed_by: "second@example.com" }),
    ]);
    await expect(
      takeOverHandler(ctx, { ...asEditor, source: "proposals", item_id: "p1" }),
    ).rejects.toThrow("Admin access required");
  });

  it("marks a day-old claim expired and lets another admin claim it outright", async () => {
    const { ctx } = createCtx({ memberships: [admin, secondAdmin] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T00:00:00.000Z"));
    await claimHandler(ctx, { ...asAdmin, source: "citations", item_id: "lsd" });
    vi.setSystemTime(new Date(Date.parse("2026-09-24T00:00:00.000Z") + INBOX_CLAIM_EXPIRY_MS));

    expect(await listClaimsHandler(ctx, asOtherAdmin)).toEqual([
      expect.objectContaining({ item_id: "lsd", claimed_by: "admin@example.com", expired: true }),
    ]);
    await expect(
      claimHandler(ctx, { ...asOtherAdmin, source: "citations", item_id: "lsd" }),
    ).resolves.toMatchObject({ claimed_by: "second@example.com" });
    expect(await listClaimsHandler(ctx, asAdmin)).toEqual([
      expect.objectContaining({ item_id: "lsd", claimed_by: "second@example.com", expired: false }),
    ]);
  });
});

describe("deciding an item ends its claim", () => {
  it("clears a proposal's claim when it is rejected", async () => {
    const { ctx } = createCtx({ memberships: [admin], changeProposals: [proposalRow()] });
    await claimHandler(ctx, { ...asAdmin, source: "proposals", item_id: "proposal_p1" });
    await claimHandler(ctx, { ...asAdmin, source: "proposals", item_id: "another" });

    await rejectHandler(ctx, { ...asAdmin, proposalId: "proposal_p1" as never, note: "Duplicate." });

    expect(await listClaimsHandler(ctx, asAdmin)).toEqual([expect.objectContaining({ item_id: "another" })]);
  });

  it("clears a review recommendation's claim when it is approved", async () => {
    const { ctx } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", note: "" });
    await claimHandler(ctx, { ...asAdmin, source: "review-recommendations", item_id: "lsd" });

    const outcome = await approveReviewRecommendationsHandler(ctx, {
      ...asAdmin,
      items: [{ slug: "lsd", revision: REVIEW_INITIAL_REVISION }],
    });

    expect(outcome.approved).toEqual(["lsd"]);
    expect(await listClaimsHandler(ctx, asAdmin)).toEqual([]);
  });

  it("clears a citation article's claim once its last row is approved, not before", async () => {
    const { ctx } = createCtx({
      memberships: [admin],
      citationEvidence: [evidenceRow("a", "approved"), evidenceRow("b", "needs_review"), evidenceRow("c", "needs_review")],
    });
    await claimHandler(ctx, { ...asAdmin, source: "citations", item_id: "lsd" });

    await setManyStatusHandler(ctx, { ...asAdmin, slug: "lsd", claimKeys: ["b"], status: "approved" });
    expect(await listClaimsHandler(ctx, asAdmin)).toHaveLength(1);

    await setManyStatusHandler(ctx, { ...asAdmin, slug: "lsd", claimKeys: ["c"], status: "approved" });
    expect(await listClaimsHandler(ctx, asAdmin)).toEqual([]);
  });
});
