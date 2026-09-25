import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approveAndApplyHandler, revertHandler } from "../server/changeProposalReview";
import { getHandler, submitHandler } from "../server/changeProposals";
import { deriveProposalTargets, hashProposalTarget } from "../server/lib/changeProposalTargets";
import { contentHash } from "./proposals/contentHash";
import { SERVER_KEY, createCtx, admin, editor, asAdmin, asEditor, type Row } from "./changeProposalReviewFixture";

// Writing proposals: an editor's blog post or article, held for an admin.

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

const storedPost: Row = {
  _id: "w1",
  _creationTime: 1700000000000,
  slug: "launch-post",
  title: "Launch post",
  kind: "blog",
  status: "draft",
  publication_status: "draft",
  bodyFormat: "markdown",
  body_raw: "Stored body.",
  teaser: "Stored teaser.",
  tags: ["News"],
  authorProfileKeys: ["JOSIE"],
  publicationDate: "2026-03-01",
};

const proposedPost = {
  slug: "launch-post",
  kind: "blog" as const,
  status: "published" as const,
  bodyFormat: "markdown" as const,
  title: "Launch post",
  teaser: "Proposed teaser.",
  coverImageUrl: "/images/launch.png",
  body: "Proposed body.",
  tags: ["News", "Launch"],
  authorProfileKeys: ["JOSIE"],
  publicationDate: "2026-03-14",
};

function rowContent(row: Row) {
  const { _id: _rowId, _creationTime: _createdAt, ...content } = row;
  return content;
}

/** The row as the Writing editor loaded it: the stored row plus its revision and history. */
const loadedPost = { ...storedPost, baseRevision: "a".repeat(64), history: [] };

function submitArgs(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: SERVER_KEY,
    actorEmail: "editor@example.com",
    payload: { writing: proposedPost },
    summary: "Update blog post",
    baselines: [{ kind: "writing", key: "launch-post", document: loadedPost }],
    ...overrides,
  };
}

describe("Writing proposal submission", () => {
  it("derives one writing target keyed by slug", async () => {
    const { ctx } = createCtx({});
    await expect(deriveProposalTargets(ctx, { writing: proposedPost })).resolves.toEqual([
      { kind: "writing", key: "launch-post" },
    ]);
  });

  it("pins the stored row's hash and writes a readable diff, without touching the row", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], effectIndexArticles: [storedPost] });

    const { proposalId } = await submitHandler(ctx, submitArgs() as never);

    const proposal = rowsOf("changeProposals").get(proposalId)!;
    expect(proposal).toMatchObject({
      status: "submitted",
      proposedBy: "editor@example.com",
      targets: [{ kind: "writing", key: "launch-post", baseHash: contentHash(rowContent(storedPost)) }],
    });
    expect(proposal.diff).toContain("writing: launch-post / body");
    expect(proposal.diff).toContain("Proposed body.");
    expect(rowsOf("effectIndexArticles").get("w1")).toEqual(storedPost);
  });

  it("accepts a new post against an absent row", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor] });

    const { proposalId } = await submitHandler(ctx, submitArgs({
      baselines: [{ kind: "writing", key: "launch-post", document: null }],
    }) as never);

    expect(rowsOf("changeProposals").get(proposalId)).toMatchObject({
      targets: [{ kind: "writing", key: "launch-post", baseHash: contentHash(null) }],
    });
    expect(rowsOf("effectIndexArticles").size).toBe(0);
  });

  it("refuses a stale baseline and a change of family or format", async () => {
    const { ctx } = createCtx({ memberships: [editor], effectIndexArticles: [storedPost] });

    await expect(submitHandler(ctx, submitArgs({
      baselines: [{ kind: "writing", key: "launch-post", document: { ...loadedPost, body_raw: "Older body." } }],
    }) as never)).rejects.toMatchObject({ data: { code: "PROPOSAL_BASELINE_STALE" } });
    await expect(submitHandler(ctx, submitArgs({ payload: { writing: { ...proposedPost, kind: "article" } } }) as never))
      .rejects.toMatchObject({ data: { code: "PROPOSAL_WRITING_INVALID" } });
    await expect(submitHandler(ctx, submitArgs({ payload: { writing: { ...proposedPost, bodyFormat: "vcode" } } }) as never))
      .rejects.toMatchObject({ data: { code: "PROPOSAL_WRITING_INVALID" } });
  });

  it("shows the proposed post to an admin reviewing it", async () => {
    const { ctx } = createCtx({ memberships: [admin, editor], effectIndexArticles: [storedPost] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);

    const detail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "admin@example.com", id: proposalId as never });

    expect(detail).toMatchObject({
      targets: [{ kind: "writing", key: "launch-post" }],
      payload: { writing: { slug: "launch-post", body: "Proposed body." } },
    });
    expect(detail?.diff).toContain("writing: launch-post");
  });
});

describe("Writing proposal apply and revert", () => {
  async function submitted(seed: Record<string, Row[]>, baseline: unknown = loadedPost) {
    const created = createCtx({ memberships: [admin, editor], ...seed });
    await submitHandler(created.ctx, submitArgs({ baselines: [{ kind: "writing", key: "launch-post", document: baseline }] }) as never);
    const [proposalId] = [...created.rowsOf("changeProposals").keys()];
    return { ...created, proposalId: proposalId as never };
  }

  it("refuses an editor's approval: applying stays admin-only", async () => {
    const { ctx, rowsOf, proposalId } = await submitted({ effectIndexArticles: [storedPost] });

    await expect(approveAndApplyHandler(ctx, { ...asEditor, proposalId })).rejects.toThrow();
    expect(rowsOf("effectIndexArticles").get("w1")).toEqual(storedPost);
  });

  it("writes the post through the Writing upsert as the approver and records its revision", async () => {
    const { ctx, rowsOf, proposalId } = await submitted({ effectIndexArticles: [storedPost] });

    const result = await approveAndApplyHandler(ctx, { ...asAdmin, proposalId });

    expect(result).toEqual({ status: "applied", revalidatePaths: ["/articles"] });
    expect(rowsOf("effectIndexArticles").get("w1")).toMatchObject({
      slug: "launch-post",
      status: "published",
      publication_status: "published",
      body_raw: "Proposed body.",
      teaser: "Proposed teaser.",
      shortDescription: "Proposed teaser.",
      coverImageUrl: "/images/launch.png",
      tags: ["News", "Launch"],
      publicationDate: "2026-03-14",
    });
    const [revision] = [...rowsOf("narrativeRevisions").values()];
    expect(revision).toMatchObject({ kind: "writing", key: "launch-post", actorEmail: "admin@example.com" });
    expect(rowsOf("changeProposals").get(proposalId as string)).toMatchObject({
      status: "applied",
      snapshotBefore: [{ kind: "writing", key: "launch-post", document: rowContent(storedPost) }],
    });
  });

  it("requests changes without writing when the post moved under the proposal", async () => {
    const { ctx, rowsOf, proposalId } = await submitted({ effectIndexArticles: [storedPost] });
    rowsOf("effectIndexArticles").set("w1", { ...storedPost, body_raw: "Edited meanwhile." });

    const result = await approveAndApplyHandler(ctx, { ...asAdmin, proposalId });

    expect(result).toMatchObject({ status: "changes_requested" });
    expect(rowsOf("effectIndexArticles").get("w1")).toMatchObject({ body_raw: "Edited meanwhile." });
  });

  it("reverts to the stored row exactly", async () => {
    const { ctx, rowsOf, proposalId } = await submitted({ effectIndexArticles: [storedPost] });
    await approveAndApplyHandler(ctx, { ...asAdmin, proposalId });

    const result = await revertHandler(ctx, { ...asAdmin, proposalId });

    expect(result).toEqual({ status: "reverted", revalidatePaths: ["/articles"] });
    expect(rowsOf("effectIndexArticles").get("w1")).toEqual(storedPost);
    expect(await hashProposalTarget(ctx, { kind: "writing", key: "launch-post" })).toBe(contentHash(rowContent(storedPost)));
  });

  it("creates a new post on approval and removes it again on revert", async () => {
    const { ctx, rowsOf, proposalId } = await submitted({}, null);

    await approveAndApplyHandler(ctx, { ...asAdmin, proposalId });
    expect([...rowsOf("effectIndexArticles").values()]).toEqual([
      expect.objectContaining({ slug: "launch-post", title: "Launch post", kind: "blog", body_raw: "Proposed body." }),
    ]);

    await revertHandler(ctx, { ...asAdmin, proposalId });
    expect(rowsOf("effectIndexArticles").size).toBe(0);
  });
});
