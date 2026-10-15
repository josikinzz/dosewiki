import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commentHandler,
  getHandler,
  listHandler,
  listMineHandler,
  submitHandler,
} from "../server/changeProposals";
import { projectEditorArticle } from "../src/data/projections/substanceReadProjections";
import { minimalArticle } from "../src/test/fixtures/articles";
import { contentHash } from "./proposals/contentHash";
import { createCtx, type Row } from "./changeProposalSubmitFixture";

const SERVER_KEY = "test-admin-key";

const editor = {
  _id: "m1",
  email: "editor@example.com",
  role: "editor",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies Row;

const contributor: Row = { ...editor, _id: "m2", email: "contributor@example.com", role: "contributor" };

const storedLsd: Row = {
  _id: "s1",
  _creationTime: 1700000000000,
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Stored summary",
};

const proposedLsd = {
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Proposed summary",
};

function submitArgs(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: SERVER_KEY,
    actorEmail: "editor@example.com",
    payload: { articles: [proposedLsd] },
    summary: "Update LSD",
    baselines: [{ kind: "article", key: "lsd", document: projectEditorArticle(storedLsd as never) }],
    ...overrides,
  };
}

describe("changeProposals.submit", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("rejects a draft loaded before a production edit and leaves existing proposals untouched", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [{ ...storedLsd, summary: "New production" }] });
    await expect(submitHandler(ctx, submitArgs() as never))
      .rejects.toMatchObject({ data: { code: "PROPOSAL_BASELINE_STALE", message: expect.stringContaining("draft is preserved") } });
    expect(rowsOf("changeProposals").size).toBe(0);
  });

  it("derives review changes from the payload even when caller and stored diffs lie", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs({ diff: "Nothing changed" }) as never);
    const stored = rowsOf("changeProposals").get(proposalId)!;
    expect(stored.diff).toContain("Proposed summary");
    expect(stored.diff).toContain("Stored summary");
    rowsOf("changeProposals").set(proposalId, { ...stored, diffVersion: undefined, diff: "Nothing changed" });
    const detail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(detail!.diff).toContain("Proposed summary");
    expect(detail!.diff).not.toContain("Nothing changed");
  });

  it("keys an article by the slug of the row its id names and refuses a proposal that moves it", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    // The payload slug is the id-row's current slug: pinned there, whatever the title says.
    await submitHandler(ctx, submitArgs({ payload: { articles: [{ ...proposedLsd, title: "Lysergide" }] } }) as never);
    const { _id: _rowId, _creationTime: _createdAt, ...storedContent } = projectEditorArticle(storedLsd as never) as Record<string, unknown>;
    expect(rowsOf("changeProposals").get("changeProposals:1")!.targets).toEqual([
      { kind: "article", key: "lsd", baseHash: contentHash(storedContent) },
    ]);

    // A renamed slug on an existing id would pin the new slug (absent, hash of
    // null) while the apply patched the id-row: refused before anything is stored.
    await expect(
      submitHandler(ctx, submitArgs({ payload: { articles: [{ ...proposedLsd, slug: "lysergide" }] } }) as never),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_SLUG_MOVE" } });
    await expect(
      submitHandler(ctx, submitArgs({
        payload: { articles: [{ ...proposedLsd, slug: undefined, title: "Lysergic acid diethylamide" }] },
      }) as never),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_SLUG_MOVE" } });
    expect(rowsOf("changeProposals").size).toBe(1);
  });

  it("refuses a contributor", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [contributor], substanceIndex: [storedLsd] });

    await expect(
      submitHandler(ctx, submitArgs({ actorEmail: "contributor@example.com" }) as never),
    ).rejects.toThrow("Editor access required");
    expect(rowsOf("changeProposals").size).toBe(0);
  });
});

describe("changeProposals reads", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("hides other editors' detail and refuses comments without leaking existence", async () => {
    const other = { ...editor, _id: "m3", email: "other@example.com" };
    const { ctx, rowsOf } = createCtx({ memberships: [editor, other], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    await expect(getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: other.email, id: proposalId })).resolves.toBeNull();
    await expect(commentHandler(ctx, { apiKey: SERVER_KEY, actorEmail: other.email, id: proposalId, text: "Not mine" }))
      .rejects.toMatchObject({ data: { code: "PROPOSAL_NOT_FOUND" } });
    expect(rowsOf("changeProposals").get(proposalId)!.comments).toEqual([]);
    expect(await getHandler(ctx, { apiKey: SERVER_KEY, id: proposalId })).not.toBeNull();
  });

  it("exposes only linked public names and server ownership while preserving private audit identities", async () => {
    const admin = { ...editor, _id: "admin", email: "reviewer@example.com", role: "admin" };
    const { ctx, rowsOf } = createCtx({
      memberships: [editor, admin],
      substanceIndex: [storedLsd],
      contributorProfiles: [
        { _id: "profile-editor", membershipEmail: editor.email, displayName: "Ada" },
        { _id: "profile-admin", membershipEmail: admin.email, displayName: `Private <${admin.email}>` },
      ],
    });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    const row = rowsOf("changeProposals").get(proposalId)!;
    rowsOf("changeProposals").set(proposalId, {
      ...row,
      reviewedBy: admin.email,
      comments: [{ by: admin.email, at: "now", text: "Checked" }],
      payload: {
        articles: [{ ...proposedLsd, submittedBy: { email: editor.email }, contactEmail: admin.email }],
        changelog: { submittedBy: editor.email, markdown: admin.email, articles: [] },
      },
    });

    const mine = await listMineHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email });
    const adminQueue = await listHandler(ctx, { apiKey: SERVER_KEY, actorEmail: admin.email });
    const ownDetail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    const adminDetail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: admin.email, id: proposalId });
    for (const result of [mine[0], adminQueue[0], ownDetail, adminDetail]) {
      expect(result).toMatchObject({ proposerName: "Ada", reviewerName: "Reviewer" });
      expect(JSON.stringify(result)).not.toContain(editor.email);
      expect(JSON.stringify(result)).not.toContain(admin.email);
    }
    expect(mine[0].isAuthor).toBe(true);
    expect(ownDetail!.isAuthor).toBe(true);
    expect(adminQueue[0].isAuthor).toBe(false);
    expect(adminDetail!.isAuthor).toBe(false);
    expect(ownDetail!.payload).toEqual({ articles: [proposedLsd] });
    expect(ownDetail!.comments).toEqual([{ authorName: "Contributor", at: "now", text: "Checked" }]);
    expect(rowsOf("changeProposals").get(proposalId)).toMatchObject({
      proposedBy: editor.email, reviewedBy: admin.email,
      comments: [{ by: admin.email, at: "now", text: "Checked" }],
    });

    const comment = await commentHandler(ctx, {
      apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId, text: "Rechecked",
    });
    expect(comment.authorName).toBe("Ada");
    expect(JSON.stringify(comment)).not.toContain(editor.email);
    rowsOf("contributorProfiles").delete("profile-editor");
    const withoutProfile = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(withoutProfile).toMatchObject({ proposerName: "Contributor", isAuthor: true });
  });
});
