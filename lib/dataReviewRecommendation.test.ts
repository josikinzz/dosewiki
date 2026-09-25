/**
 * Editors recommend an article as reviewed; only an admin approval completes
 * it, at the revision the recommendation covered. Drives the real handlers
 * against the in-memory Postgres fixture.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeHandler } from "../server/articleLifecycle";
import { articleBaseHash, loadArticle, publishedArticleRevision } from "../server/lib/articleRevisionJournal";
import { articleDocument } from "../server/lib/articleLifecycleValidation";
import {
  approveReviewRecommendationsHandler,
  listReviewRecommendationsHandler,
  recommendEditorialReviewHandler,
  setEditorialReviewHandler,
} from "../server/lib/substanceReviewHandlers";
import { REVIEW_INITIAL_REVISION } from "../src/schema/substance/editorial";
import { SERVER_KEY, admin, createCtx, editor, proposedLsd, storedLsd, type Row } from "./changeProposalReviewFixture";

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };
const asEditor = { apiKey: SERVER_KEY, actorEmail: "editor@example.com" };

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

type Ctx = ReturnType<typeof createCtx>["ctx"];

const article = (id: string, slug: string, title: string): Row => ({ ...structuredClone(storedLsd), _id: id, slug, title });

async function publish(ctx: Ctx, summary: string, changeId: string) {
  const before = articleDocument(await loadArticle(ctx, "lsd"));
  return writeHandler(ctx, {
    ...asAdmin,
    action: "publish",
    slug: "lsd",
    baseHash: await articleBaseHash(ctx, before),
    changeId,
    article: { ...before, ...structuredClone(proposedLsd), summary, editorial_review: before.editorial_review } as never,
    summary: `Set the summary to ${summary}`,
  });
}

function reviewOf(rowsOf: ReturnType<typeof createCtx>["rowsOf"], id = "s1") {
  return rowsOf("substanceIndex").get(id)!.editorial_review as Record<string, unknown>;
}

describe("review recommendations", () => {
  it("records an editor recommendation at the current revision without completing the review", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await publish(ctx, "Published summary", "change-first-0001");
    const revision = await publishedArticleRevision(ctx, "lsd");

    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", revision, note: "Doses match the sources" });

    const review = reviewOf(rowsOf);
    expect(review.status).not.toBe("completed");
    expect(review).not.toHaveProperty("reviewed_revision");
    expect(review.recommendation).toMatchObject({ revision, recommended_by: "editor@example.com", note: "Doses match the sources" });
  });

  it("refuses a recommendation for a revision the article has moved past", async () => {
    const { ctx } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await publish(ctx, "Published summary", "change-first-0001");
    await expect(
      recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", revision: REVIEW_INITIAL_REVISION, note: "" }),
    ).rejects.toMatchObject({ data: { code: "REVIEW_REVISION_OUTDATED" } });
  });

  it("never lets an editor approve a recommendation", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", note: "" });
    await expect(
      approveReviewRecommendationsHandler(ctx, { ...asEditor, items: [{ slug: "lsd", revision: REVIEW_INITIAL_REVISION }] }),
    ).rejects.toThrow("Admin access required");
    expect(reviewOf(rowsOf).status).not.toBe("completed");
  });

  it("approves three recommendations in one write, each at its recommended revision", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd, article("s2", "dmt", "DMT"), article("s3", "mdma", "MDMA")],
    });
    for (const slug of ["lsd", "dmt", "mdma"]) {
      await recommendEditorialReviewHandler(ctx, { ...asEditor, slug, note: "" });
    }

    const outcome = await approveReviewRecommendationsHandler(ctx, {
      ...asAdmin,
      items: ["lsd", "dmt", "mdma"].map((slug) => ({ slug, revision: REVIEW_INITIAL_REVISION })),
    });

    expect(outcome).toEqual({ approved: ["lsd", "dmt", "mdma"], stale: [], missing: [] });
    for (const id of ["s1", "s2", "s3"]) {
      expect(reviewOf(rowsOf, id)).toMatchObject({
        status: "completed",
        reviewed_by: "admin@example.com",
        reviewed_revision: REVIEW_INITIAL_REVISION,
      });
      expect(reviewOf(rowsOf, id)).not.toHaveProperty("recommendation");
    }
  });

  it("reports a recommendation made stale by a later publish instead of approving it", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", note: "" });
    await publish(ctx, "Edited after the recommendation", "change-after-0001");

    const outcome = await approveReviewRecommendationsHandler(ctx, {
      ...asAdmin,
      items: [{ slug: "lsd", revision: REVIEW_INITIAL_REVISION }],
    });

    expect(outcome).toEqual({ approved: [], stale: ["lsd"], missing: [] });
    expect(reviewOf(rowsOf).status).not.toBe("completed");
  });

  it("keeps a recommendation through a hold", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", note: "" });
    await setEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", status: "in_progress" });
    expect(reviewOf(rowsOf).recommendation).toMatchObject({ recommended_by: "editor@example.com" });
  });

  it("lists recommendations with whether each is stale", async () => {
    const { ctx } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd, article("s2", "dmt", "DMT")],
    });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", note: "" });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "dmt", note: "Checked" });
    await publish(ctx, "Edited after the recommendation", "change-after-0001");
    const lsdRevision = await publishedArticleRevision(ctx, "lsd");

    // The projection reader's two narrow reads, served from the fixture rows.
    const rows = async () => (await Promise.all(["lsd", "dmt"].map((slug) => loadArticle(ctx, slug)))).map((row) => ({
      slug: row.slug as string,
      title: row.title,
      status: null,
      reviewedRevision: null,
      recommendation: (row.editorial_review as Record<string, unknown>).recommendation,
    }));
    const db = Object.assign(Object.create(ctx.db), {
      getReviewRecommendationRows: rows,
      getPublishedArticleRevisions: async () => [{ slug: "lsd", revision: lsdRevision }],
    });

    const listed = await listReviewRecommendationsHandler({ ...ctx, db } as never, asAdmin);

    expect(listed.map(({ slug, stale }) => ({ slug, stale }))).toEqual(
      expect.arrayContaining([{ slug: "lsd", stale: true }, { slug: "dmt", stale: false }]),
    );
    await expect(listReviewRecommendationsHandler({ ...ctx, db } as never, asEditor)).rejects.toThrow("Admin access required");
  });
});
