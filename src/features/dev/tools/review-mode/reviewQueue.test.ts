import { describe, expect, it } from "vitest";

import type { SubstanceArticle } from "@/schema";
import {
  buildReviewGroups,
  buildReviewFlagGroups,
  buildReviewQueue,
  deriveReviewFlagSummary,
  deriveReviewFlagLabels,
  filterReviewQueue,
  filterToPlacedSlugs,
  flattenHomeOrder,
  queueIndexOf,
  sortReviewQueue,
  type ReviewGroupLayout,
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
    flagSummary: null,
    flags: [],
    ...overrides,
  };
}

describe("buildReviewQueue", () => {
  it("keeps only publicly listed articles", () => {
    const queue = buildReviewQueue([
      makeArticle({ title: "Zeta", slug: "zeta" }),
      makeArticle({ title: "Alpha", slug: "alpha" }),
      makeArticle({ title: "Quiet", slug: "quiet", priority: "low" }),
      makeArticle({ title: "Hidden for now", slug: "hidden-for-now", priority: "hide_for_now" }),
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

  it("prefers the projected reference_count a slim library row carries", () => {
    const queue = buildReviewQueue([
      makeArticle({
        title: "Slim",
        slug: "slim",
        // The slim row ships the count, not the arrays.
        reference_count: 7,
      } as unknown as Partial<SubstanceArticle & { slug?: string }>),
    ]);
    expect(queue[0]?.referenceCount).toBe(7);
  });

  it("reads slim and hydrated rows of the same article to the same count", () => {
    const slim = makeArticle({
      title: "Slim",
      slug: "same-article",
      reference_count: 3,
    } as unknown as Partial<SubstanceArticle & { slug?: string }>);
    const hydrated = makeArticle({
      title: "Slim",
      slug: "same-article",
      references: [{ id: "r1" }],
      source_citations: [{ note: "legacy" }, { note: "older" }],
    } as unknown as Partial<SubstanceArticle & { slug?: string }>);
    const [slimEntry] = buildReviewQueue([slim]);
    const [hydratedEntry] = buildReviewQueue([hydrated]);
    expect(slimEntry?.referenceCount).toBe(3);
    expect(hydratedEntry?.referenceCount).toBe(3);
  });

});

describe("filterToPlacedSlugs", () => {
  const entries = [
    makeEntry({ slug: "dmt", name: "DMT" }),
    makeEntry({ slug: "lsd", name: "LSD", status: "completed" }),
    makeEntry({ slug: "nowhere", name: "Nowhere" }),
  ];

  it("drops entries the layout never places", () => {
    const filtered = filterToPlacedSlugs(entries, ["lsd", "dmt"]);
    expect(filtered.map((entry) => entry.slug)).toEqual(["dmt", "lsd"]);
  });

  it("keeps the full queue when no placements exist", () => {
    const filtered = filterToPlacedSlugs(entries, []);
    expect(filtered.map((entry) => entry.slug)).toEqual([
      "dmt",
      "lsd",
      "nowhere",
    ]);
    expect(filtered).not.toBe(entries);
  });
});

describe("deriveReviewFlagSummary", () => {
  const flag = (severity: "major" | "minor" | "note") => ({
    label: "Needs work",
    severity,
    note: "",
    source: "agent" as const,
    created_at: "2026-08-02T12:00:00.000Z",
  });

  it("returns no badge data when an article has no Review Flags", () => {
    expect(deriveReviewFlagSummary(undefined)).toBeNull();
    expect(deriveReviewFlagSummary([])).toBeNull();
  });

  it("counts flags and selects the highest Flag Severity", () => {
    expect(deriveReviewFlagSummary([flag("note"), flag("major"), flag("minor")])).toEqual({
      count: 3,
      highestSeverity: "major",
    });
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

describe("buildReviewGroups", () => {
  const layout: ReviewGroupLayout = {
    categories: [
      {
        key: "psychedelic",
        label: "Psychedelic",
        iconKey: "psychedelic",
        sections: [
          { key: "common", label: "Common", drugs: ["lsd"] },
          { key: "tryptamine", label: "Tryptamine", drugs: ["dmt", "4-aco-dmt"] },
          { key: "scaline", label: "Scalines", drugs: ["mescaline"] },
        ],
        drugs: ["loose-psychedelic"],
      },
      {
        key: "dissociative",
        label: "Dissociative",
        iconKey: "dissociative",
        // Also listed under psychedelics above: first placement wins.
        sections: [{ key: "common", label: "Common", drugs: ["ketamine", "lsd"] }],
        drugs: [],
      },
    ],
  };

  const entries = [
    makeEntry({ slug: "ketamine", name: "Ketamine" }),
    makeEntry({ slug: "dmt", name: "DMT" }),
    makeEntry({ slug: "lsd", name: "LSD", status: "completed" }),
    makeEntry({ slug: "loose-psychedelic", name: "Loose" }),
    makeEntry({ slug: "nowhere", name: "Nowhere" }),
  ];

  it("nests the queue under categories and their subsections", () => {
    const groups = buildReviewGroups(entries, layout);
    expect(
      groups.map((group) => [
        group.key,
        group.count,
        group.sections.map((section) => [
          section.key,
          section.entries.map((entry) => entry.slug),
        ]),
        group.entries.map((entry) => entry.slug),
      ]),
    ).toEqual([
      [
        "psychedelic",
        3,
        [
          ["common", ["lsd"]],
          ["tryptamine", ["dmt"]],
        ],
        ["loose-psychedelic"],
      ],
      ["dissociative", 1, [["common", ["ketamine"]]], []],
      ["__unplaced", 1, [], ["nowhere"]],
    ]);
  });

  it("keeps the incoming order inside each bucket", () => {
    const [psychedelics] = buildReviewGroups(
      [
        makeEntry({ slug: "4-aco-dmt", name: "4-AcO-DMT" }),
        makeEntry({ slug: "dmt", name: "DMT" }),
      ],
      layout,
    );
    expect(psychedelics.sections[0]?.entries.map((entry) => entry.slug)).toEqual([
      "4-aco-dmt",
      "dmt",
    ]);
  });

  it("carries the icon key and drops empty buckets", () => {
    const groups = buildReviewGroups(
      [makeEntry({ slug: "dmt", name: "DMT" })],
      layout,
    );
    expect(groups.map((group) => group.key)).toEqual(["psychedelic"]);
    expect(groups[0]?.iconKey).toBe("psychedelic");
    expect(groups[0]?.sections.map((section) => section.key)).toEqual([
      "tryptamine",
    ]);
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

  it("filters by one or more exact labels and severity, excluding unflagged articles", () => {
    const flagged = [
      makeEntry({ slug: "skinny", flags: [{ label: "skinny", severity: "minor" }] }),
      makeEntry({ slug: "citations", flags: [{ label: "missing citations", severity: "major" }] }),
      makeEntry({ slug: "none", flags: [] }),
    ];
    expect(filterReviewQueue(flagged, { unreviewedOnly: false, currentSlug: null, flagLabels: ["skinny", "missing citations"] }).map((entry) => entry.slug)).toEqual(["skinny", "citations"]);
    expect(filterReviewQueue(flagged, { unreviewedOnly: false, currentSlug: null, flagSeverity: "major" }).map((entry) => entry.slug)).toEqual(["citations"]);
  });
});

describe("Review Flag facets", () => {
  const entries = [
    makeEntry({ slug: "a", flags: [{ label: "skinny", severity: "minor" }, { label: "stale data", severity: "major" }] }),
    makeEntry({ slug: "b", flags: [{ label: "skinny", severity: "note" }] }),
  ];
  it("derives sorted distinct labels", () => expect(deriveReviewFlagLabels(entries)).toEqual(["skinny", "stale data"]));
  it("groups by label and severity", () => {
    expect(buildReviewFlagGroups(entries, "label").map((group) => [group.label, group.count])).toEqual([["skinny", 2], ["stale data", 1]]);
    expect(buildReviewFlagGroups(entries, "severity").map((group) => [group.label, group.count])).toEqual([["major", 1], ["minor", 1], ["note", 1]]);
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

/**
 * The workbench's in-app ← / → are exactly `visible[position - 1]` and
 * `visible[position + 1]` — list position, never visit history. The one case
 * where "the list" is not obvious is the unreviewed-only exemption, which
 * keeps a completed article visible purely because it is the one on screen.
 */
describe("the flip-through's prev/next positions", () => {
  const queue: ReviewQueueEntry[] = [
    makeEntry({ slug: "a", name: "A", status: "completed" }),
    makeEntry({ slug: "b", name: "B", status: "needed" }),
    makeEntry({ slug: "c", name: "C", status: "completed" }),
    makeEntry({ slug: "d", name: "D", status: "needed" }),
  ];

  const neighbours = (unreviewedOnly: boolean, currentSlug: string | null) => {
    const visible = filterReviewQueue(queue, { unreviewedOnly, currentSlug });
    const position = queueIndexOf(visible, currentSlug);
    return {
      previous: visible[position - 1]?.slug ?? null,
      next: visible[position + 1]?.slug ?? null,
    };
  };

  it("walks the whole queue when the filter is off", () => {
    expect(neighbours(false, "c")).toEqual({ previous: "b", next: "d" });
  });

  it("keeps the exempted current article between its unreviewed neighbours", () => {
    // "c" is completed and survives the filter only because it is on screen;
    // it still sits in list order, so ← and → reach the entries either side.
    expect(neighbours(true, "c")).toEqual({ previous: "b", next: "d" });
  });

  it("has no previous when the exempted article heads the filtered list", () => {
    expect(neighbours(true, "a")).toEqual({ previous: null, next: "b" });
  });

  it("treats an article outside the queue as the queue's head", () => {
    // A deep link to a non-public slug renders the head of the queue, so the
    // arrows move relative to that rather than to an article nothing shows.
    expect(neighbours(false, "not-in-queue")).toEqual({
      previous: null,
      next: "b",
    });
  });
});
