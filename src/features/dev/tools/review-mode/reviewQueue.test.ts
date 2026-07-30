import { describe, expect, it } from "vitest";

import type { SubstanceArticle } from "@/schema";
import {
  buildReviewQueue,
  filterReviewQueue,
  flattenHomeOrder,
  queueIndexOf,
  sortReviewQueue,
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

function makeEntry(overrides: Partial<ReviewQueueEntry>): ReviewQueueEntry {
  return {
    slug: "entry",
    name: "Entry",
    status: "needed",
    referenceCount: 0,
    ...overrides,
  };
}

describe("buildReviewQueue", () => {
  it("keeps only publicly listed articles", () => {
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

  it("derives a slug from the title when none is stored", () => {
    const queue = buildReviewQueue([
      makeArticle({ title: "No Slug Here", slug: undefined }),
    ]);
    expect(queue[0]?.slug).toBe("no-slug-here");
  });

  it("counts bibliography entries as the fallback richness", () => {
    const queue = buildReviewQueue([
      makeArticle({
        title: "Sourced",
        slug: "sourced",
        references: [{ id: "r1" }, { id: "r2" }],
        source_citations: [{ note: "legacy" }],
      } as unknown as Partial<SubstanceArticle & { slug?: string }>),
    ]);
    expect(queue[0]?.referenceCount).toBe(3);
  });
});

describe("sortReviewQueue", () => {
  const entries: ReviewQueueEntry[] = [
    makeEntry({ slug: "a", name: "Alpha", referenceCount: 1 }),
    makeEntry({ slug: "m", name: "Middle", referenceCount: 5 }),
    makeEntry({ slug: "z", name: "Zeta", referenceCount: 3 }),
  ];

  it("defaults source order to token stats, falling back to reference counts", () => {
    const sorted = sortReviewQueue(entries, "sources", {
      sourceTokens: { z: 10_000 },
    });
    // z has stats; m and a fall back to their bibliography sizes.
    expect(sorted.map((entry) => entry.slug)).toEqual(["z", "m", "a"]);
  });

  it("orders by the home page layout with strays trailing alphabetically", () => {
    const sorted = sortReviewQueue(entries, "home", {
      homeOrder: ["z", "a"],
    });
    expect(sorted.map((entry) => entry.slug)).toEqual(["z", "a", "m"]);
  });

  it("sorts alphabetically in both directions", () => {
    expect(
      sortReviewQueue(entries, "alpha").map((entry) => entry.slug),
    ).toEqual(["a", "m", "z"]);
    expect(
      sortReviewQueue(entries, "alpha-desc").map((entry) => entry.slug),
    ).toEqual(["z", "m", "a"]);
  });
});

describe("flattenHomeOrder", () => {
  it("walks categories, sections, then loose drugs, deduplicated", () => {
    expect(
      flattenHomeOrder({
        categories: [
          {
            sections: [{ drugs: ["lsd", "dmt"] }, { drugs: ["dmt", "shrooms"] }],
            drugs: ["mescaline"],
          },
          { sections: [], drugs: ["ketamine", "lsd"] },
        ],
      }),
    ).toEqual(["lsd", "dmt", "shrooms", "mescaline", "ketamine"]);
  });
});

describe("filterReviewQueue", () => {
  const entries: ReviewQueueEntry[] = [
    makeEntry({ slug: "a", name: "A", status: "completed" }),
    makeEntry({ slug: "b", name: "B", status: "needed" }),
    makeEntry({ slug: "c", name: "C", status: "completed" }),
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
    makeEntry({ slug: "a", name: "A" }),
    makeEntry({ slug: "b", name: "B" }),
  ];

  it("finds the slug's position and falls back to the start", () => {
    expect(queueIndexOf(entries, "b")).toBe(1);
    expect(queueIndexOf(entries, "missing")).toBe(0);
    expect(queueIndexOf(entries, null)).toBe(0);
  });
});
