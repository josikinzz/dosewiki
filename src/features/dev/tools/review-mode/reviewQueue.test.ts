import { describe, expect, it } from "vitest";

import type { SubstanceArticle } from "@/schema";
import { buildReviewQueue, filterReviewQueue, type ReviewQueueEntry } from "./reviewQueue";

function makeArticle(
  overrides: Partial<SubstanceArticle & { slug?: string }> = {},
): SubstanceArticle & { slug?: string } {
  return {
    id: null,
    title: "Test Substance",
    slug: "test-substance",
    priority: "normal",
    index_categories: [],
    identification: {},
    classification: {},
    summary: "",
    dosage: { routes: [] },
    duration: { routes: [] },
    subjective_effects: {},
    comparisons: [],
    pharmacology: {},
    interactions: {},
    reagent_testing: {},
    tolerance: {
      full_tolerance: "",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: [],
    },
    harm_potential: {},
    history_culture: null,
    legality: {},
    editorial_review: { status: "needed", notes: "" },
    references: [],
    source_citations: [],
    citations: [],
    ...overrides,
  } as SubstanceArticle & { slug?: string };
}

function makeEntry(overrides: Partial<ReviewQueueEntry>): ReviewQueueEntry {
  return {
    slug: "entry",
    name: "Entry",
    status: "needed",
    referenceCount: 0,
    flagSummary: null,
    flags: [],
    ...overrides,
  };
}

describe("buildReviewQueue", () => {
  it("prefers a tick recorded against the article's current status", () => {
    const queue = buildReviewQueue(
      [makeArticle({ title: "Todo", slug: "todo" })],
      { todo: { status: "completed", baseStatus: "needed" } },
    );
    expect(queue[0]?.status).toBe("completed");
  });

  it("lets a changed article status win over a stale tick", () => {
    const queue = buildReviewQueue(
      [
        makeArticle({
          title: "Edited",
          slug: "edited",
          // The editor form set this after the tick was recorded.
          editorial_review: { status: "in_progress", notes: "" },
        }),
      ],
      { edited: { status: "completed", baseStatus: "needed" } },
    );
    expect(queue[0]?.status).toBe("in_progress");
  });
});

describe("changed since review", () => {
  const signed = (slug: string, revision: string | undefined) =>
    makeArticle({
      slug,
      title: slug,
      editorial_review: {
        status: "completed",
        notes: "",
        reviewed_by: "admin@example.com",
        ...(revision ? { reviewed_revision: revision } : {}),
      },
    });

  it("derives stale when the published revision moved past the signed one", () => {
    const queue = buildReviewQueue(
      [signed("heroin", "rev1"), signed("morphine", "rev2"), signed("codeine", "initial"), signed("legacy", undefined)],
      {},
      { heroin: "rev9", morphine: "rev2", legacy: "rev3" },
    );
    expect(Object.fromEntries(queue.map((entry) => [entry.slug, entry.status]))).toEqual({
      codeine: "completed",
      heroin: "stale",
      legacy: "completed",
      morphine: "completed",
    });
  });

  it("derives nothing stale before the published revisions arrive", () => {
    const queue = buildReviewQueue([signed("heroin", "rev1")], {}, null);
    expect(queue[0].status).toBe("completed");
  });

  it("reads the sign-off the reviewer just recorded over the library row", () => {
    const queue = buildReviewQueue(
      [signed("heroin", "rev1")],
      { heroin: { status: "completed", baseStatus: "completed", review: { status: "completed", notes: "", reviewed_revision: "rev9" } } },
      { heroin: "rev9" },
    );
    expect(queue[0].status).toBe("completed");
  });

  it("keeps stale articles in the unreviewed-only flip-through", () => {
    const entries = [makeEntry({ slug: "a", status: "stale" }), makeEntry({ slug: "b", status: "completed" })];
    expect(filterReviewQueue(entries, { unreviewedOnly: true, currentSlug: null }).map((entry) => entry.slug)).toEqual(["a"]);
  });
});
