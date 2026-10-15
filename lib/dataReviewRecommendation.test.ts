import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeHandler } from "../server/articleLifecycle";
import { articleBaseHash, loadArticle, publishedArticleRevision } from "../server/lib/articleRevisionJournal";
import { articleDocument } from "../server/lib/articleLifecycleValidation";
import {
  approveReviewRecommendationsHandler,
  recommendEditorialReviewHandler,
} from "../server/lib/substanceReviewHandlers";
import { SERVER_KEY, admin, createCtx, editor, proposedLsd, storedLsd } from "./changeProposalReviewFixture";

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };
const asEditor = { apiKey: SERVER_KEY, actorEmail: "editor@example.com" };

beforeEach(() => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    article: { ...before, ...structuredClone(proposedLsd), summary, editorial_review: before.editorial_review } as never,
    summary: `Set the summary to ${summary}`,
  });
}

function reviewOf(rowsOf: ReturnType<typeof createCtx>["rowsOf"]) {
  return rowsOf("substanceIndex").get("s1")!.editorial_review as Record<string, unknown>;
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
    const read = await publishedArticleRevision(ctx, "lsd");
    await publish(ctx, "Published summary", "change-first-0001");
    await expect(
      recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", revision: read, note: "" }),
    ).rejects.toMatchObject({ data: { code: "REVIEW_REVISION_OUTDATED" } });
  });

  it("never lets an editor approve a recommendation", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", note: "" });
    const revision = await publishedArticleRevision(ctx, "lsd");
    await expect(
      approveReviewRecommendationsHandler(ctx, { ...asEditor, items: [{ slug: "lsd", revision }] }),
    ).rejects.toThrow("Admin access required");
    expect(reviewOf(rowsOf).status).not.toBe("completed");
  });

  it("reports a recommendation made stale by a later publish instead of approving it", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd] });
    await recommendEditorialReviewHandler(ctx, { ...asEditor, slug: "lsd", note: "" });
    const recommended = await publishedArticleRevision(ctx, "lsd");
    await publish(ctx, "Edited after the recommendation", "change-after-0001");

    const outcome = await approveReviewRecommendationsHandler(ctx, {
      ...asAdmin,
      items: [{ slug: "lsd", revision: recommended }],
    });

    expect(outcome).toEqual({ approved: [], stale: ["lsd"], missing: [] });
    expect(reviewOf(rowsOf).status).not.toBe("completed");
  });
});
