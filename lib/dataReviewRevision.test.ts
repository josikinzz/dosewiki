/**
 * A review sign-off records the published revision it covered, and a later
 * publish makes that sign-off stale. Drives the real handlers against the
 * in-memory Postgres fixture: sign off, publish through the article lifecycle,
 * then read the published revision and the changes since the sign-off.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeHandler } from "../server/articleLifecycle";
import { articleBaseHash, loadArticle, publishedArticleRevision } from "../server/lib/articleRevisionJournal";
import { articleDocument } from "../server/lib/articleLifecycleValidation";
import { getReviewChangesHandler, setEditorialReviewHandler } from "../server/lib/substanceReviewHandlers";
import { deriveReviewState, REVIEW_INITIAL_REVISION } from "../src/schema/substance/editorial";
import { SERVER_KEY, admin, createCtx, editor, proposedLsd, storedLsd } from "./changeProposalReviewFixture";

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

type Ctx = ReturnType<typeof createCtx>["ctx"];

async function publish(ctx: Ctx, summary: string, changeId: string) {
  const before = articleDocument(await loadArticle(ctx, "lsd"));
  return writeHandler(ctx, {
    ...asAdmin,
    action: "publish",
    slug: "lsd",
    baseHash: await articleBaseHash(ctx, before),
    changeId,
    // The published review record rides along untouched, as editors send it.
    article: { ...before, ...structuredClone(proposedLsd), summary, editorial_review: before.editorial_review } as never,
    summary: `Set the summary to ${summary}`,
  });
}

function storedReview(rowsOf: ReturnType<typeof createCtx>["rowsOf"]) {
  return rowsOf("substanceIndex").get("s1")!.editorial_review as Record<string, unknown>;
}

describe("review sign-off revision", () => {
  it("records the published revision and the reviewer on sign-off", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await publish(ctx, "First published summary", "change-first-0001");
    const revision = await publishedArticleRevision(ctx, "lsd");
    expect(revision).not.toBe(REVIEW_INITIAL_REVISION);

    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });

    expect(storedReview(rowsOf)).toMatchObject({
      status: "completed",
      reviewed_by: "admin@example.com",
      reviewed_revision: revision,
    });
  });

  it("records the initial marker when the article has no revision yet", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });
    expect(storedReview(rowsOf).reviewed_revision).toBe(REVIEW_INITIAL_REVISION);
  });

  it("makes the sign-off stale once the article is published again", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });
    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("completed");

    await publish(ctx, "Edited after review", "change-after-0001");

    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("stale");
  });

  it("refuses a revision that is not a published state of the article", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await expect(
      setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed", revision: "abc123" }),
    ).rejects.toMatchObject({ data: { code: "REVIEW_REVISION_UNKNOWN" } });
    expect(storedReview(rowsOf)).toEqual(storedLsd.editorial_review);
  });

  it("restores an older signed revision on undo, which stays stale", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await publish(ctx, "First published summary", "change-first-0001");
    const older = await publishedArticleRevision(ctx, "lsd");
    await publish(ctx, "Second published summary", "change-second-01");

    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed", revision: older });

    expect(storedReview(rowsOf).reviewed_revision).toBe(older);
    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("stale");
  });

  it("returns the article at the signed revision and as published now", async () => {
    const { ctx } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await publish(ctx, "Reviewed summary", "change-first-0001");
    const signed = await publishedArticleRevision(ctx, "lsd");
    await publish(ctx, "Edited after review", "change-after-0001");

    const changes = await getReviewChangesHandler(ctx, { ...asAdmin, slug: "lsd", revision: signed });

    expect(changes.signed).toMatchObject({ summary: "Reviewed summary" });
    expect(changes.current).toMatchObject({ summary: "Edited after review" });
    expect(changes.signed).not.toHaveProperty("editorial_review");
  });

  it("reads the article before its first revision for an initial sign-off", async () => {
    const { ctx } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await publish(ctx, "Edited after review", "change-after-0001");

    const changes = await getReviewChangesHandler(ctx, { ...asAdmin, slug: "lsd", revision: REVIEW_INITIAL_REVISION });

    expect(changes.signed).toMatchObject({ summary: "Stored summary" });
    expect(changes.current).toMatchObject({ summary: "Edited after review" });
  });
});
