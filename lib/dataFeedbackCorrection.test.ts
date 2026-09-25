/**
 * Article feedback connects to the correction that answers it (ticket 59).
 * Drives the real handlers against the in-memory Postgres fixture: an editor
 * starts a correction from feedback, the proposal carries the feedback id and
 * section and nothing else, the feedback records the link, and another admin
 * follows it to the proposal and, once approved, to its published revision.
 * A rejected proposal never reads as a completed correction.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeHandler } from "../server/articleLifecycle";
import { correctionsHandler, linkChangeHandler, transition as feedbackTransition } from "../server/articleFeedback";
import { approveAndApplyHandler, rejectHandler } from "../server/changeProposalReview";
import { getHandler, listHandler } from "../server/changeProposals";
import { articleBaseHash, loadArticle } from "../server/lib/articleRevisionJournal";
import { articleDocument } from "../server/lib/articleLifecycleValidation";
import { isCompletedCorrection } from "../src/features/intake/feedbackCorrection";
import { SERVER_KEY, admin, createCtx, editor, proposedLsd, storedLsd, type Row } from "./changeProposalReviewFixture";

type Ctx = ReturnType<typeof createCtx>["ctx"];
type RegisteredHandler = { _handler: (ctx: Ctx, args: unknown) => Promise<unknown> };
const handlerOf = (fn: unknown) => (fn as RegisteredHandler)._handler;

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };
const asEditor = { apiKey: SERVER_KEY, actorEmail: "editor@example.com" };

const READER_EMAIL = "reader.private@example.org";
const READER_WORDS = "The oral dose range looks ten times too high to me.";

const feedback: Row = {
  _id: "af1",
  id: "fb-0001",
  status: "new",
  schema_version: 1,
  substance_slug: "lsd",
  substance_title: "LSD",
  category: "inaccurate",
  importance: "critical",
  details: READER_WORDS,
  contact_email: READER_EMAIL,
  honeypot_triggered: false,
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
};

function seed() {
  return createCtx({ memberships: [admin, editor], substanceIndex: [storedLsd], articleFeedback: [feedback] });
}

async function submitCorrection(ctx: Ctx, overrides: Record<string, unknown> = {}) {
  const before = articleDocument(await loadArticle(ctx, "lsd"));
  const result = await writeHandler(ctx, {
    ...asEditor,
    action: "submit",
    slug: "lsd",
    baseHash: await articleBaseHash(ctx, before),
    changeId: `change-${Math.random().toString(36).slice(2, 12)}`,
    article: { ...before, ...structuredClone(proposedLsd), editorial_review: before.editorial_review } as never,
    summary: "Correct the oral dose range",
    feedbackRef: { id: "fb-0001", section: "dosage" },
    ...overrides,
  });
  return (result as { proposalId: string }).proposalId as never;
}

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

describe("starting a correction from article feedback", () => {
  it("carries the feedback id and section into the proposal and never the reader's contact or words", async () => {
    const { ctx, rowsOf } = seed();
    const proposalId = await submitCorrection(ctx);

    const stored = rowsOf("changeProposals").get(proposalId)!;
    expect((stored.payload as { feedbackRef?: unknown }).feedbackRef).toEqual({ id: "fb-0001", section: "dosage" });
    // Nothing from the feedback row other than its id rides on the proposal.
    expect(JSON.stringify(stored)).not.toContain(READER_EMAIL);
    expect(JSON.stringify(stored)).not.toContain(READER_WORDS);

    // What a non-admin proposer reads back names the feedback by id only.
    const detail = await getHandler(ctx, { ...asEditor, id: proposalId });
    const [summary] = await listHandler(ctx, asEditor);
    expect(detail).toMatchObject({ feedbackRef: { id: "fb-0001", section: "dosage" } });
    expect(summary).toMatchObject({ feedbackRef: { id: "fb-0001", section: "dosage" } });
    for (const projected of [detail, summary]) {
      expect(JSON.stringify(projected)).not.toContain(READER_EMAIL);
      expect(JSON.stringify(projected)).not.toContain(READER_WORDS);
    }
  });

  it("records the proposal on the feedback without moving its status", async () => {
    const { ctx, rowsOf } = seed();
    const proposalId = await submitCorrection(ctx);

    const row = rowsOf("articleFeedback").get("af1")!;
    expect(row.status).toBe("new");
    expect(row.decision_log).toEqual([
      expect.objectContaining({
        actor: "editor@example.com",
        from: "new",
        to: "new",
        linked_change: { kind: "proposal", id: proposalId },
      }),
    ]);
  });

  it("refuses a feedback reference about another article", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      articleFeedback: [{ ...feedback, substance_slug: "psilocybin" }],
    });
    await expect(submitCorrection(ctx)).rejects.toMatchObject({ data: { code: "FEEDBACK_REF_INVALID" } });
    expect(rowsOf("changeProposals").size).toBe(0);
  });
});

describe("following feedback to its correction", () => {
  it("lets another admin follow the feedback to the proposal and then to its published revision", async () => {
    const { ctx, rowsOf } = seed();
    const proposalId = await submitCorrection(ctx);

    const pending = await correctionsHandler(ctx, { ...asAdmin, id: "fb-0001" });
    expect(pending.corrections).toEqual([
      expect.objectContaining({ state: "pending", proposal: expect.objectContaining({ id: proposalId, status: "submitted" }) }),
    ]);
    expect(isCompletedCorrection(pending.corrections[0].state)).toBe(false);

    await approveAndApplyHandler(ctx, { ...asAdmin, proposalId });

    const published = await correctionsHandler(ctx, { ...asAdmin, id: "fb-0001" });
    const revision = [...rowsOf("articleRevisions").values()].find((row) => row.changeId === `proposal-${proposalId}:lsd`)!;
    expect(published.corrections).toEqual([
      expect.objectContaining({
        state: "published",
        proposal: expect.objectContaining({ id: proposalId, status: "applied" }),
        revision: expect.objectContaining({ id: revision._id }),
      }),
    ]);
    expect(isCompletedCorrection(published.corrections[0].state)).toBe(true);
    // The resolved answer names changes by id, status, summary and date; no actor or reader detail.
    expect(JSON.stringify(published)).not.toContain("editor@example.com");
    expect(JSON.stringify(published)).not.toContain(READER_EMAIL);
  });

  it("shows a rejected proposal as rejected, never as a completed correction", async () => {
    const { ctx } = seed();
    const proposalId = await submitCorrection(ctx);
    await rejectHandler(ctx, { ...asAdmin, proposalId, note: "The source does not support this range." });

    const { corrections } = await correctionsHandler(ctx, { ...asAdmin, id: "fb-0001" });
    expect(corrections).toEqual([expect.objectContaining({ state: "rejected" })]);
    expect(corrections[0].revision).toBeUndefined();
    expect(isCompletedCorrection(corrections[0].state)).toBe(false);
  });

  it("follows a returned proposal to the revision that replaced it", async () => {
    const { ctx, rowsOf } = seed();
    const first = await submitCorrection(ctx);
    // The editor reworks it; the resubmission need not name the feedback again.
    const second = await submitCorrection(ctx, { feedbackRef: undefined, revisionOf: first, summary: "Correct the oral dose range, take two" });

    expect((rowsOf("changeProposals").get(second)!.payload as { feedbackRef?: unknown }).feedbackRef).toEqual({ id: "fb-0001", section: "dosage" });
    const { corrections } = await correctionsHandler(ctx, { ...asAdmin, id: "fb-0001" });
    expect(corrections).toEqual([
      expect.objectContaining({ state: "pending", revisedFrom: first, proposal: expect.objectContaining({ id: second }) }),
    ]);
  });

  it("keeps the corrections read to admins", async () => {
    const { ctx } = seed();
    await expect(correctionsHandler(ctx, { ...asEditor, id: "fb-0001" })).rejects.toThrow();
  });
});

describe("linking an existing change", () => {
  it("links a published revision of the same article and refuses one of another article", async () => {
    const { ctx, rowsOf } = seed();
    const proposalId = await submitCorrection(ctx, { feedbackRef: undefined });
    await approveAndApplyHandler(ctx, { ...asAdmin, proposalId });
    const revision = [...rowsOf("articleRevisions").values()][0];

    const linked = await linkChangeHandler(ctx, { ...asAdmin, id: "fb-0001", change: { kind: "revision", id: revision._id } });
    expect(linked.status).toBe("new");
    expect(linked.decision_log).toEqual([
      expect.objectContaining({ actor: "admin@example.com", linked_change: { kind: "revision", id: revision._id } }),
    ]);
    const { corrections } = await correctionsHandler(ctx, { ...asAdmin, id: "fb-0001" });
    expect(corrections).toEqual([expect.objectContaining({ state: "published", revision: expect.objectContaining({ id: revision._id }) })]);

    rowsOf("articleRevisions").set("articleRevisions:elsewhere", { ...revision, _id: "articleRevisions:elsewhere", slug: "psilocybin" });
    await expect(
      linkChangeHandler(ctx, { ...asAdmin, id: "fb-0001", change: { kind: "revision", id: "articleRevisions:elsewhere" } }),
    ).rejects.toThrow(/Illegal link/);
  });

  it("keeps linking to admins", async () => {
    const { ctx } = seed();
    const proposalId = await submitCorrection(ctx, { feedbackRef: undefined });
    await expect(
      linkChangeHandler(ctx, { ...asEditor, id: "fb-0001", change: { kind: "proposal", id: proposalId } }),
    ).rejects.toThrow();
  });
});

describe("explicit outcomes", () => {
  it("records the outcome on the decision that closes the feedback", async () => {
    const { ctx, rowsOf } = seed();
    await handlerOf(feedbackTransition)(ctx, { ...asAdmin, id: "fb-0001", status: "resolved", outcome: "duplicate", note: "Same as the report from March." });
    await handlerOf(feedbackTransition)(ctx, { ...asAdmin, id: "fb-0001", status: "reviewing" });
    await handlerOf(feedbackTransition)(ctx, { ...asAdmin, id: "fb-0001", status: "rejected", outcome: "no_change_needed" });

    expect(rowsOf("articleFeedback").get("af1")!.decision_log).toEqual([
      expect.objectContaining({ from: "new", to: "resolved", outcome: "duplicate", note: "Same as the report from March." }),
      expect.not.objectContaining({ outcome: expect.anything() }),
      expect.objectContaining({ from: "reviewing", to: "rejected", outcome: "no_change_needed" }),
    ]);
  });

  it("refuses an outcome with a status it does not close the item with", async () => {
    const { ctx, rowsOf } = seed();
    await expect(
      handlerOf(feedbackTransition)(ctx, { ...asAdmin, id: "fb-0001", status: "rejected", outcome: "explanation_provided" }),
    ).rejects.toThrow(/Illegal transition/);
    expect(rowsOf("articleFeedback").get("af1")!.status).toBe("new");
  });
});
