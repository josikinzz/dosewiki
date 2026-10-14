import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approveAndApplyHandler } from "../server/changeProposalReview";
import { submitHandler } from "../server/changeProposals";
import { projectEditorArticle } from "../src/data/projections/substanceReadProjections";
import {
  SERVER_KEY,
  admin,
  asAdmin,
  createCtx,
  editor,
  proposalRow,
  proposedLsd,
  storedLsd,
} from "./changeProposalReviewFixture";

const otherEditor = { ...editor, _id: "m2", email: "other@example.com" };

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

describe("changeProposals.submit with revisionOf", () => {
  it("refuses another editor's proposal and writes nothing", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [editor, otherEditor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow({ status: "changes_requested" })],
    });

    await expect(submitHandler(ctx, {
      apiKey: SERVER_KEY,
      actorEmail: "other@example.com",
      payload: { articles: [{ ...proposedLsd, summary: "Rebased summary" }] },
      summary: "Update LSD (rebased)",
      baselines: [{ kind: "article", key: "lsd", document: projectEditorArticle(storedLsd as never) }],
      revisionOf: "proposal_p1",
    } as never)).rejects.toMatchObject({
      data: { code: "PROPOSAL_NOT_OWNED" },
    });

    expect(rowsOf("changeProposals").size).toBe(1);
    expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe("changes_requested");
  });
});

describe("changeProposalReview.approveAndApply on a superseded proposal", () => {
  it("refuses with PROPOSAL_STATUS_INVALID and leaves production alone", async () => {
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow({ status: "superseded" })],
    });

    await expect(approveAndApplyHandler(ctx, asAdmin)).rejects.toMatchObject({
      data: { code: "PROPOSAL_STATUS_INVALID" },
    });

    expect(rowsOf("substanceIndex").get("s1")!.summary).toBe("Stored summary");
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.replace).not.toHaveBeenCalled();
  });
});
