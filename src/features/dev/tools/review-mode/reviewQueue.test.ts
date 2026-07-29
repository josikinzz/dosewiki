import { describe, expect, it } from "vitest";

import type { SubstanceArticle } from "@/schema";
import {
  buildReviewQueue,
  filterReviewQueue,
  queueIndexOf,
  type ReviewQueueEntry,
} from "./reviewQueue";

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

describe("buildReviewQueue", () => {
  it("keeps only publicly listed articles, sorted by name", () => {
    const queue = buildReviewQueue([
      makeArticle({ title: "Zeta", slug: "zeta" }),
      makeArticle({ title: "Alpha", slug: "alpha" }),
      makeArticle({ title: "Quiet", slug: "quiet", priority: "low" }),
      makeArticle({
        title: "Concealed",
        slug: "concealed",
        index_categories: ["hidden"],
      }),
    ]);
    expect(queue.map((entry) => entry.slug)).toEqual(["alpha", "zeta"]);
  });

  it("reads review status from the article and prefers overrides", () => {
    const queue = buildReviewQueue(
      [
        makeArticle({
          title: "Done",
          slug: "done",
          editorial_review: { status: "completed", notes: "" },
        }),
        makeArticle({ title: "Todo", slug: "todo" }),
      ],
      { todo: "completed" },
    );
    expect(queue.map((entry) => entry.status)).toEqual([
      "completed",
      "completed",
    ]);
  });

  it("derives a slug from the title when none is stored", () => {
    const queue = buildReviewQueue([
      makeArticle({ title: "No Slug Here", slug: undefined }),
    ]);
    expect(queue[0]?.slug).toBe("no-slug-here");
  });
});

describe("filterReviewQueue", () => {
  const entries: ReviewQueueEntry[] = [
    { slug: "a", name: "A", status: "completed" },
    { slug: "b", name: "B", status: "needed" },
    { slug: "c", name: "C", status: "completed" },
  ];

  it("drops completed entries in unreviewed-only mode, keeping the current one", () => {
    expect(
      filterReviewQueue(entries, { unreviewedOnly: true, currentSlug: "c" }).map(
        (entry) => entry.slug,
      ),
    ).toEqual(["b", "c"]);
  });

  it("returns everything when the toggle is off", () => {
    expect(
      filterReviewQueue(entries, { unreviewedOnly: false, currentSlug: null }),
    ).toHaveLength(3);
  });
});

describe("queueIndexOf", () => {
  const entries: ReviewQueueEntry[] = [
    { slug: "a", name: "A", status: "needed" },
    { slug: "b", name: "B", status: "needed" },
  ];

  it("finds the slug's position and falls back to the start", () => {
    expect(queueIndexOf(entries, "b")).toBe(1);
    expect(queueIndexOf(entries, "missing")).toBe(0);
    expect(queueIndexOf(entries, null)).toBe(0);
  });
});
