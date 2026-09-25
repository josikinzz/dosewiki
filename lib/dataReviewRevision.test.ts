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
import { addHumanReviewFlagHandler, getReviewChangesHandler, setEditorialReviewHandler } from "../server/lib/substanceReviewHandlers";
import { saveSubstancesHandler, setIupacNameHandler } from "../server/lib/substanceWriteHandlers";
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

  it("journals the stored article privately when a sign-off finds nothing journaled", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    const revision = await publishedArticleRevision(ctx, "lsd");
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });

    expect(storedReview(rowsOf).reviewed_revision).toBe(revision);
    const journal = [...rowsOf("articleRevisions").values()];
    expect(journal).toHaveLength(1);
    expect(journal[0].after).toMatchObject({ summary: "Stored summary" });
    expect(rowsOf("changelog").size).toBe(0);

    // Signing again finds the content already journaled.
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });
    expect(rowsOf("articleRevisions").size).toBe(1);
  });

  it("makes the sign-off stale after a staged batch save, and still reads the signed content", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });
    const signed = storedReview(rowsOf).reviewed_revision as string;

    // The /api/save-article Commit path: saveArticleBatch.save runs this with no journal row.
    const stored = articleDocument(await loadArticle(ctx, "lsd"));
    const saved = await saveSubstancesHandler(ctx, {
      ...asAdmin,
      articles: [{ ...stored, summary: "Saved through the batch" } as never],
    });
    expect(saved.updated).toBe(1);

    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("stale");
    const changes = await getReviewChangesHandler(ctx, { ...asAdmin, slug: "lsd", revision: signed });
    expect(changes.signed).toMatchObject({ summary: "Stored summary" });
    expect(changes.current).toMatchObject({ summary: "Saved through the batch" });
  });

  it("makes the sign-off stale after an IUPAC write", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });
    const identification = (await loadArticle(ctx, "lsd")).identification as { iupac_name?: string };

    await setIupacNameHandler(ctx, { ...asAdmin, slug: "lsd", value: "A corrected name", expected: identification.iupac_name ?? "" });

    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("stale");
  });

  it("makes the sign-off stale when the molecule chemistry changes, but not for a flag", async () => {
    const molecule = { _id: "m-lsd", _creationTime: 1, slug: "lsd", svg: "<svg/>", molblock: "first", updatedAt: "2026-01-01" };
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd], moleculeOverrides: [molecule] });
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });

    await addHumanReviewFlagHandler(ctx, { ...asAdmin, slug: "lsd", flag: { label: "formatting", severity: "note", note: "" } });
    await ctx.db.patch("m-lsd" as never, { svg: "<svg>re-rendered</svg>" });
    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("completed");

    await ctx.db.patch("m-lsd" as never, { molblock: "second" });
    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("stale");
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
