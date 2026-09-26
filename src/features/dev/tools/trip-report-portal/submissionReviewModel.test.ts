import { describe, expect, it } from "vitest";

import { attributionMoved, changedReportParts, classifyRefusal, submissionHoldOf } from "./submissionReviewModel";
import { describePortalEmpty, EMPTY_PORTAL_FACETS, sortPortalRows, toPortalRowFromSubmission } from "./tripReportPortalModel";

const base = { created_at: "2026-01-01T00:00:00.000Z" };

describe("submissionHoldOf", () => {
  it("reads who holds or decided a submission from the decision log", () => {
    expect(submissionHoldOf({ ...base, status: "submitted" }, "me@x")).toEqual({ kind: "open" });
    const claimed = (actor: string) => ({
      ...base,
      status: "reviewing" as const,
      decision_log: [{ at: "2026-01-02T00:00:00.000Z", actor, from: "submitted" as const, to: "reviewing" as const }],
    });
    expect(submissionHoldOf(claimed("Me@X"), "me@x")).toEqual({ kind: "mine", at: "2026-01-02T00:00:00.000Z" });
    expect(submissionHoldOf(claimed("them@x"), "me@x")).toMatchObject({ kind: "other", by: "them@x" });
    expect(submissionHoldOf({ ...base, status: "reviewing" }, "me@x")).toEqual({ kind: "unknown" });
    expect(submissionHoldOf({ ...base, status: "accepted", reviewed_by: "me@x" }, "me@x")).toMatchObject({ kind: "accepted", mine: true });
    expect(submissionHoldOf({ ...base, status: "spam", reviewed_by: "them@x" }, "me@x")).toMatchObject({ kind: "decided", by: "them@x" });
    expect(submissionHoldOf({ ...base, status: "exported" }, "me@x")).toMatchObject({ kind: "published" });
  });
});

describe("classifyRefusal", () => {
  it("sorts the freeze, a conflict and the byline guard apart from any other refusal", () => {
    expect(classifyRefusal(503, { error: "x", code: "DATA_WRITES_FROZEN" }, "f").kind).toBe("frozen");
    expect(classifyRefusal(409, { error: "This report changed since it was opened." }, "f").kind).toBe("conflict");
    expect(classifyRefusal(409, { error: 'Author name "A" matches contributor profile "A".' }, "f").kind).toBe("claim");
    expect(classifyRefusal(500, {}, "Fallback")).toEqual({ kind: "other", message: "Fallback" });
  });
});

describe("changedReportParts", () => {
  const saved = { title: "A", subject: { name: "N", age: "30" }, substances: [], onset: [], peak: [], offset: [], tags: [] };
  it("names the parts a draft changes, in reading order, plus attribution", () => {
    const draft = { ...saved, title: "B", subject: { name: "N", age: "31" }, tags: ["x"] };
    expect(changedReportParts(saved, draft, true)).toEqual(["title", "trip details", "tags", "attribution"]);
    expect(changedReportParts(saved, { ...saved, subject: { ...saved.subject, name: "M" } }, false)).toEqual(["byline"]);
  });
  it("treats only a chosen, different profile as an attribution change", () => {
    expect(attributionMoved("RIVER", null)).toBe(false);
    expect(attributionMoved("RIVER", "RIVER")).toBe(false);
    expect(attributionMoved("RIVER", "")).toBe(true);
    expect(attributionMoved(null, "MIRA")).toBe(true);
  });
});

describe("portal order and empty lists", () => {
  const row = (id: string, created: string, status: "submitted" | "rejected" = "submitted", trip?: string) =>
    toPortalRowFromSubmission({
      id,
      status,
      title: id,
      author_name: "anon",
      created_at: created,
      report: { subject: { name: "anon", ...(trip ? { trip_date: trip } : {}) }, substances: [{ name: "LSD" }], tags: [] },
    });

  it("puts the submission waiting longest first, whatever its trip date", () => {
    const rows = [row("late", "2026-01-05T00:00:00Z", "submitted", "2020-01-01"), row("early", "2026-01-01T00:00:00Z", "submitted", "2025-01-01")];
    expect(sortPortalRows(rows, "waiting").map((entry) => entry.id)).toEqual(["early", "late"]);
    expect(sortPortalRows(rows, "newest").map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("says why a view is empty and where a search finds something", () => {
    const rows = [row("done", "2026-01-01T00:00:00Z", "rejected")];
    expect(describePortalEmpty(rows, { bucket: "needs", query: "", facets: EMPTY_PORTAL_FACETS, sort: "waiting" })).toMatchObject({
      kind: "bucket",
      message: expect.stringMatching(/^All clear/),
    });
    expect(describePortalEmpty(rows, { bucket: "needs", query: "done", facets: EMPTY_PORTAL_FACETS, sort: "waiting" })).toEqual({
      kind: "filtered",
      message: "No needs review report matches “done”.",
      found: [{ bucket: "all", count: 1 }],
    });
    expect(describePortalEmpty([], { bucket: "all", query: "", facets: EMPTY_PORTAL_FACETS, sort: "newest" }).kind).toBe("clear");
  });
});
