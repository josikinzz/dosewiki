import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approveAndApplyHandler, rejectHandler, revertHandler } from "../server/changeProposalReview";
import { contentHash } from "./proposals/contentHash";
import {
  SERVER_KEY,
  createCtx,
  admin,
  editor,
  storedLsd,
  proposedLsd,
  proposedLayout,
  liveArticleDocument,
  proposalRow,
  asAdmin,
  asEditor,
} from "./changeProposalReviewFixture";


beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

describe("changeProposalReview.approveAndApply", () => {
  it("requires a different admin to approve an admin-authored proposal", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow({ proposedBy: "admin@example.com" })],
    });
    await expect(approveAndApplyHandler(ctx, asAdmin)).rejects.toMatchObject({ data: { code: "PROPOSAL_SELF_APPROVAL" } });
    expect(rowsOf("substanceIndex").get("s1")).toEqual(storedLsd);
    expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe("submitted");
  });
  it("applies the payload through the article write path and records the snapshot, hashes, and changelog", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "applied", revalidatePaths: ["/lsd", "/substances"] });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Proposed summary", slug: "lsd" });

    const proposal = rowsOf("changeProposals").get("proposal_p1")!;
    expect(proposal).toMatchObject({
      status: "applied",
      appliedChangelogEntryId: "proposal-proposal_p1",
      reviewedBy: "admin@example.com",
    });
    expect(proposal.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const appliedHashes = proposal.appliedHashes as Array<{ kind: string; key: string; hash: string }>;
    expect(appliedHashes).toEqual([
      { kind: "article", key: "lsd", hash: contentHash(liveArticleDocument(rowsOf("substanceIndex").get("s1")!)) },
    ]);
    expect(appliedHashes[0].hash).not.toBe(contentHash(liveArticleDocument(storedLsd)));

    const [entry] = [...rowsOf("changelog").values()];
    expect(entry).toMatchObject({
      entryId: "proposal-proposal_p1",
      submittedBy: "EDITOR",
    });
    expect(JSON.stringify(entry)).not.toContain("@example.com");
    expect(entry.markdown).toContain("Proposed summary");
    expect(entry.markdown).toContain("Stored summary");
  });

  it("journals and restores the unprojected article without unrelated normalization changes", async () => {
    const source = {
      ...storedLsd,
      _creationTime: 0,
      pharmacology: { ...storedLsd.pharmacology as Record<string, unknown>, legacyDetail: "Preserve raw source" },
    };
    const { _id, _creationTime, ...before } = source;
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [source],
      changeProposals: [proposalRow({
        payload: { articles: [{ ...before, summary: "Narrow revision" }] },
        targets: [{ kind: "article", key: "lsd", baseHash: contentHash(liveArticleDocument(source)) }],
      })],
    });
    await approveAndApplyHandler(ctx, asAdmin);
    const [revision] = [...rowsOf("articleRevisions").values()];
    expect(revision.before).toEqual(before);
    expect(revision.after).toEqual({ ...before, summary: "Narrow revision" });
    const [entry] = [...rowsOf("changelog").values()];
    expect(entry.markdown).toContain("Narrow revision");
    expect(entry.markdown).not.toContain("pharmacology");
    await revertHandler(ctx, asAdmin);
    expect(rowsOf("substanceIndex").get("s1")).toEqual(source);
  });

  it("applies an index layout through the layout write path, including the categoryLayout mirror", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      changeProposals: [
        proposalRow({
          targets: [{ kind: "indexLayout", key: "psychoactive", baseHash: contentHash(null) }],
          payload: {
            indexLayouts: [proposedLayout],
            changelog: { markdown: "layout diff", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
          },
        }),
      ],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "applied", revalidatePaths: ["/substances"] });
    expect([...rowsOf("indexLayouts").values()]).toMatchObject([proposedLayout]);
    expect([...rowsOf("categoryLayout").values()]).toMatchObject([
      { version: 2, categories: [{ key: "psychedelics", sections: [{ key: "classic", drugs: ["lsd"] }] }] },
    ]);
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({
      status: "applied",
      snapshotBefore: [{ kind: "indexLayout", key: "psychoactive", document: null }],
    });
    expect([...rowsOf("changelog").values()][0]).toMatchObject({
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
    });
  });

  it("flips a drifted proposal to changes_requested and writes nothing to production", async () => {
    const drifted = { ...storedLsd, summary: "Someone else edited this" };
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [drifted],
      changeProposals: [proposalRow()],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({
      status: "changes_requested",
      conflictReason: 'Production changed since this proposal was drafted: article "lsd". Rebase and resubmit.',
    });
    expect(rowsOf("substanceIndex").get("s1")).toEqual(drifted);
    expect(rowsOf("changelog").size).toBe(0);
    expect(db.patch).toHaveBeenCalledTimes(1);
    expect(db.patch).toHaveBeenCalledWith("proposal_p1", expect.objectContaining({ status: "changes_requested" }));
    expect(db.insert).not.toHaveBeenCalled();
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({
      status: "changes_requested",
      reviewedBy: "admin@example.com",
      conflictReason: expect.stringContaining('article "lsd"'),
    });
  });

  it("treats the id-row moving to another slug as drift, so the apply never patches an unpinned row", async () => {
    // The proposal pinned the row with id 1 at "lsd"; an admin renamed it since.
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [{ ...storedLsd, slug: "lysergide" }],
      changeProposals: [proposalRow()],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toMatchObject({ status: "changes_requested" });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ slug: "lysergide", summary: "Stored summary" });
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "changes_requested" });
  });

  it("refuses an ID acquired at another slug after a creation proposal was submitted", async () => {
    const newArticle = { ...proposedLsd, id: 2, slug: "new-article" };
    const unrelated = { ...storedLsd, _id: "s2", id: 2, slug: "other-article", summary: "Unrelated production" };
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [unrelated],
      changeProposals: [proposalRow({
        targets: [{ kind: "article", key: "new-article", baseHash: contentHash(null) }],
        payload: { articles: [newArticle] },
      })],
    });
    const result = await approveAndApplyHandler(ctx, asAdmin);
    expect(result).toMatchObject({ status: "changes_requested" });
    expect(rowsOf("substanceIndex").get("s2")).toEqual(unrelated);
    expect(rowsOf("substanceIndex").size).toBe(1);
    expect(rowsOf("changelog").size).toBe(0);
  });

  it("refuses a proposal that is not open for approval", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow({ status: "rejected" })],
    });

    await expect(approveAndApplyHandler(ctx, asAdmin)).rejects.toMatchObject({
      data: { code: "PROPOSAL_STATUS_INVALID" },
    });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Stored summary" });
  });

  it("refuses an unknown proposal", async () => {
    const { ctx } = createCtx({ memberships: [admin] });

    await expect(approveAndApplyHandler(ctx, asAdmin)).rejects.toMatchObject({
      data: { code: "PROPOSAL_NOT_FOUND" },
    });
  });
});

describe("changeProposalReview.reject", () => {
  it("requires a note", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], changeProposals: [proposalRow()] });

    await expect(rejectHandler(ctx, { ...asAdmin, note: "   " })).rejects.toMatchObject({
      data: { code: "PROPOSAL_NOTE_REQUIRED" },
    });
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "submitted" });
  });

  it("marks the proposal rejected with the note and reviewer", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      changeProposals: [proposalRow({ status: "changes_requested" })],
    });

    await expect(rejectHandler(ctx, { ...asAdmin, note: " Duplicate of an earlier fix. " })).resolves.toEqual({
      status: "rejected",
    });
    const proposal = rowsOf("changeProposals").get("proposal_p1")!;
    expect(proposal).toMatchObject({
      status: "rejected",
      reviewNotes: "Duplicate of an earlier fix.",
      reviewedBy: "admin@example.com",
    });
    expect(proposal.reviewedAt).toBe(proposal.updatedAt);
  });

  it("refuses to reject an applied proposal", async () => {
    const { ctx } = createCtx({ memberships: [admin], changeProposals: [proposalRow({ status: "applied" })] });

    await expect(rejectHandler(ctx, { ...asAdmin, note: "no" })).rejects.toMatchObject({
      data: { code: "PROPOSAL_STATUS_INVALID" },
    });
  });
});

describe("changeProposalReview.revert", () => {
  it("refuses a proposal that was never applied", async () => {
    const { ctx } = createCtx({ memberships: [admin], substanceIndex: [storedLsd], changeProposals: [proposalRow()] });

    await expect(revertHandler(ctx, asAdmin)).rejects.toMatchObject({ data: { code: "PROPOSAL_STATUS_INVALID" } });
  });

  it("refuses when production moved past the applied state and writes nothing", async () => {
    const appliedRow = { ...storedLsd, summary: "Proposed summary" };
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [{ ...appliedRow, summary: "Edited again after apply" }],
      changeProposals: [
        proposalRow({
          status: "applied",
          snapshotBefore: [{ kind: "article", key: "lsd", document: liveArticleDocument(storedLsd) }],
          appliedHashes: [{ kind: "article", key: "lsd", hash: contentHash(liveArticleDocument(appliedRow)) }],
        }),
      ],
    });

    await expect(revertHandler(ctx, asAdmin)).rejects.toMatchObject({ data: { code: "REVERT_CONFLICT" } });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Edited again after apply" });
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "applied" });
    expect(rowsOf("changelog").size).toBe(0);
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("writes the snapshot back after an apply and marks the proposal reverted", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });
    await approveAndApplyHandler(ctx, asAdmin);
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Proposed summary" });

    const result = await revertHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "reverted", revalidatePaths: ["/lsd", "/substances"] });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Stored summary", slug: "lsd", title: "LSD" });
    const proposal = rowsOf("changeProposals").get("proposal_p1")!;
    expect(proposal).toMatchObject({ status: "reverted" });
    expect(proposal.revertedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const entries = [...rowsOf("changelog").values()];
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      entryId: "revert-proposal_p1",
      message: "Reverted proposal proposal_p1",
      submittedBy: "ADMIN",
    });
    expect(JSON.stringify(entries[1])).not.toContain("@example.com");
    expect(entries[1].markdown).toContain(proposal.summary);
    expect(proposal.reviewedBy).toBe("admin@example.com");
  });

  it("removes a row the proposal created when the snapshot recorded absence", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      changeProposals: [
        proposalRow({
          targets: [{ kind: "article", key: "lsd", baseHash: contentHash(null) }],
        }),
      ],
    });
    await approveAndApplyHandler(ctx, asAdmin);
    expect(rowsOf("substanceIndex").size).toBe(1);

    await revertHandler(ctx, asAdmin);

    expect(rowsOf("substanceIndex").size).toBe(0);
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "reverted" });
  });

  it("puts the categoryLayout mirror back when reverting a psychoactive layout that did not exist before", async () => {
    const seededMirror = {
      _id: "cl1",
      _creationTime: 1,
      version: 1,
      categories: [{ key: "seeded", label: "Seeded", iconKey: "seeded", sections: [], drugs: ["dmt"] }],
    };
    const layoutProposal = proposalRow({
      targets: [{ kind: "indexLayout", key: "psychoactive", baseHash: contentHash(null) }],
      payload: { indexLayouts: [proposedLayout] },
    });

    // The mirror was seeded directly (scripts/seed) and no indexLayouts row exists yet.
    const withMirror = createCtx({
      memberships: [admin],
      categoryLayout: [seededMirror],
      changeProposals: [layoutProposal],
    });
    await approveAndApplyHandler(withMirror.ctx, asAdmin);
    expect([...withMirror.rowsOf("categoryLayout").values()]).toMatchObject([{ version: 2 }]);
    expect(withMirror.rowsOf("changeProposals").get("proposal_p1")).toMatchObject({
      snapshotBefore: [
        {
          kind: "indexLayout",
          key: "psychoactive",
          document: null,
          categoryLayout: { version: 1, categories: seededMirror.categories },
        },
      ],
    });

    await revertHandler(withMirror.ctx, asAdmin);

    expect(withMirror.rowsOf("indexLayouts").size).toBe(0);
    expect([...withMirror.rowsOf("categoryLayout").values()]).toMatchObject([
      { version: 1, categories: seededMirror.categories },
    ]);

    // Neither row existed: the revert clears the mirror the apply projected.
    const withoutMirror = createCtx({ memberships: [admin], changeProposals: [layoutProposal] });
    await approveAndApplyHandler(withoutMirror.ctx, asAdmin);
    expect(withoutMirror.rowsOf("categoryLayout").size).toBe(1);
    expect(withoutMirror.rowsOf("changeProposals").get("proposal_p1")).toMatchObject({
      snapshotBefore: [{ kind: "indexLayout", key: "psychoactive", document: null, categoryLayout: null }],
    });

    await revertHandler(withoutMirror.ctx, asAdmin);

    expect(withoutMirror.rowsOf("indexLayouts").size).toBe(0);
    expect(withoutMirror.rowsOf("categoryLayout").size).toBe(0);
  });

  it("restores reference metadata exactly without merging the applied enrichment back in", async () => {
    // Source metadata and prose belong to the same audited inverse.
    const reference = {
      id: "ref-1",
      type: "journal_article",
      title: "Lysergide pharmacology",
      authors: ["Hofmann A"],
      doi: "10.1000/lsd",
    };
    const stored = { ...storedLsd, references: [reference] };
    const proposed = { ...proposedLsd, references: [{ ...reference, containerTitle: "Journal of Ergolines" }] };
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [stored],
      changeProposals: [
        proposalRow({
          targets: [{ kind: "article", key: "lsd", baseHash: contentHash(liveArticleDocument(stored)) }],
          payload: { articles: [proposed] },
        }),
      ],
    });
    await approveAndApplyHandler(ctx, asAdmin);
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({
      summary: "Proposed summary",
      references: [{ id: "ref-1", containerTitle: "Journal of Ergolines" }],
    });

    await revertHandler(ctx, asAdmin);
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Stored summary" });
    expect(rowsOf("substanceIndex").get("s1")?.references).toEqual([reference]);
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "reverted" });
    expect(rowsOf("changelog").size).toBe(2);
  });
});

describe("changeProposalReview admin floor", () => {
  it("refuses an editor at approve, reject, and revert without touching anything", async () => {
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    await expect(approveAndApplyHandler(ctx, asEditor)).rejects.toThrow("Admin access required");
    await expect(rejectHandler(ctx, { ...asEditor, note: "no" })).rejects.toThrow("Admin access required");
    await expect(revertHandler(ctx, asEditor)).rejects.toThrow("Admin access required");
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "submitted" });
  });
});

