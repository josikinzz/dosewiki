import { describe, expect, it } from "vitest";
import { describeWork, filterRows, reviewCounts, viewCounts, workBySlug, type SubstanceRow } from "./substanceListModel";

const row = (slug: string, extra: Partial<SubstanceRow> = {}): SubstanceRow => ({
  slug, name: slug.toUpperCase(), reviewStatus: "needed", directUrlOnly: false, work: null, ...extra,
});
const rows = [
  row("lsd", { reviewStatus: "in_progress" }),
  row("mdma", { work: { draftAt: "2026-01-01T00:00:00Z" } }),
  row("quiet", { directUrlOnly: true }),
  row("ket", { reviewStatus: "stale", work: { proposal: { id: "p1", status: "changes_requested" } } }),
];

describe("substance list", () => {
  it("keeps direct-URL-only articles out of Listed and in All", () => {
    expect(filterRows(rows, { query: "", view: "listed", review: "any", order: "alpha-asc" }).map((r) => r.slug)).toEqual(["ket", "lsd", "mdma"]);
    expect(filterRows(rows, { query: "", view: "all", review: "any", order: "alpha-desc" }).map((r) => r.slug)).toEqual(["quiet", "mdma", "lsd", "ket"]);
  });

  it("lists the member's drafts and proposals under Your work", () => {
    expect(filterRows(rows, { query: "", view: "mine", review: "any", order: "alpha-asc" }).map((r) => r.slug)).toEqual(["ket", "mdma"]);
  });

  it("counts views and review states under the search", () => {
    expect(viewCounts(rows, "", "any")).toEqual({ listed: 3, mine: 2, all: 4 });
    expect(reviewCounts(rows, "", "listed")).toEqual({ any: 3, needed: 1, in_progress: 1, completed: 0, stale: 1 });
    expect(viewCounts(rows, "qui", "any")).toEqual({ listed: 0, mine: 0, all: 1 });
  });

  it("reads work from drafts and article proposals, newest proposal first", () => {
    const work = workBySlug(
      [{ slug: "mdma", updatedAt: "t" }],
      [
        { _id: "old", status: "submitted", createdAt: "2026-01-01", targets: [{ kind: "article", key: "lsd" }] },
        { _id: "new", status: "changes_requested", createdAt: "2026-02-01", targets: [{ kind: "article", key: "lsd" }, { kind: "copyBlock", key: "x" }] },
      ],
    );
    expect(work.get("mdma")).toEqual({ draftAt: "t" });
    expect(work.get("lsd")).toEqual({ proposal: { id: "new", status: "changes_requested" } });
    expect(work.has("x")).toBe(false);
  });

  it("words the work on a row", () => {
    expect(describeWork({ draftAt: "t" })?.label).toBe("Your draft");
    expect(describeWork({ proposal: { id: "p", status: "submitted" } })?.label).toBe("Proposal waiting");
    expect(describeWork({ draftAt: "t", proposal: { id: "p", status: "changes_requested" } })?.label).toBe("Changes requested");
    expect(describeWork(null)).toBeNull();
  });
});
