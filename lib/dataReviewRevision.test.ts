import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeHandler } from "../server/articleLifecycle";
import { articleBaseHash, loadArticle, publishedArticleRevision } from "../server/lib/articleRevisionJournal";
import { articleDocument } from "../server/lib/articleLifecycleValidation";
import { addHumanReviewFlagHandler, setEditorialReviewHandler } from "../server/lib/substanceReviewHandlers";
import { saveSubstancesHandler, setIupacNameHandler } from "../server/lib/substanceWriteHandlers";
import { deriveReviewState } from "../src/schema/substance/editorial";
import { SERVER_KEY, admin, createCtx, proposedLsd, storedLsd } from "./changeProposalReviewFixture";

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };

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

function storedReview(rowsOf: ReturnType<typeof createCtx>["rowsOf"]) {
  return rowsOf("substanceIndex").get("s1")!.editorial_review as Record<string, unknown>;
}

describe("review sign-off revision", () => {
  it("makes the sign-off stale after a staged batch save", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], substanceIndex: [storedLsd] });
    await setEditorialReviewHandler(ctx, { ...asAdmin, slug: "lsd", status: "completed" });

    const stored = articleDocument(await loadArticle(ctx, "lsd"));
    const saved = await saveSubstancesHandler(ctx, {
      ...asAdmin,
      articles: [{ ...stored, summary: "Saved through the batch" } as never],
    });
    expect(saved.updated).toBe(1);

    expect(deriveReviewState(storedReview(rowsOf), await publishedArticleRevision(ctx, "lsd"))).toBe("stale");
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
});
