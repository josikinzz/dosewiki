import { describe, expect, it } from "vitest";

import {
  activeFacetCount,
  bucketOf,
  countBucket,
  countFacet,
  EMPTY_PORTAL_FACETS,
  filterPortalRows,
  groupPortalRows,
  NEEDS_REVIEW_SUBMISSION_STATUSES,
  portalStats,
  rowMatchesQuery,
  sortPortalRows,
  toggleFacetValue,
  toPortalRowFromReport,
  toPortalRowFromSubmission,
  type PortalRow,
} from "./tripReportPortalModel";

function published(
  overrides: {
    id: string;
    title: string;
    author: string;
    substances?: { name: string; dose?: string }[];
    tags?: string[];
    tripDate?: string;
  },
): PortalRow {
  return toPortalRowFromReport({
    id: overrides.id,
    slug: overrides.id,
    featured: false,
    createdAt: Date.parse("2024-01-01T00:00:00Z"),
    title: overrides.title,
    subject: { name: overrides.author, trip_date: overrides.tripDate },
    substances: overrides.substances ?? [{ name: "LSD" }],
    tags: overrides.tags ?? [],
  });
}

function submission(overrides: {
  id: string;
  title: string;
  author: string;
  status: "submitted" | "reviewing" | "accepted" | "rejected" | "spam" | "exported";
  substances?: { name: string }[];
  tags?: string[];
  createdAt?: string;
}): PortalRow {
  return toPortalRowFromSubmission({
    id: overrides.id,
    status: overrides.status,
    title: overrides.title,
    author_name: overrides.author,
    created_at: overrides.createdAt ?? "2025-06-01T12:00:00Z",
    report: {
      subject: { name: overrides.author },
      substances: overrides.substances ?? [{ name: "Ketamine" }],
      tags: overrides.tags ?? [],
    },
  });
}

const corpus: PortalRow[] = [
  published({ id: "a", title: "Alpine clarity", author: "nervewing", substances: [{ name: "LSD" }], tags: ["visual"], tripDate: "2023-05-01" }),
  published({ id: "b", title: "Blue hour", author: "coldbrew", substances: [{ name: "LSD" }, { name: "Cannabis" }], tags: ["visual", "combo"], tripDate: "2021-02-02" }),
  published({ id: "c", title: "Cellar door", author: "nervewing", substances: [{ name: "Psilocybin" }], tripDate: "2024-09-09" }),
  submission({ id: "s1", title: "Went as predicted", author: "anon", status: "submitted", substances: [{ name: "Methamphetamine" }] }),
  submission({ id: "s2", title: "Second pass", author: "coldbrew", status: "reviewing" }),
  submission({ id: "s3", title: "Ready to publish", author: "anon", status: "accepted" }),
  submission({ id: "s4", title: "Junk", author: "spammer", status: "spam" }),
];

describe("portal row identity", () => {
  it("makes a submission and a published report the same row type", () => {
    const [report] = corpus;
    const queued = corpus[3];

    expect(report.origin).toBe("published");
    expect(queued.origin).toBe("submission");
    // Only the status differs; neither index row carries a report body, which
    // is fetched per row when the editor opens one.
    expect(report.statusKind).toBe("published");
    expect(queued.statusKind).toBe("needs");
    expect(report.fields).toBeNull();
    expect(queued.fields).toBeNull();
  });

  it("namespaces a submission key so it cannot collide with a published slug", () => {
    expect(corpus[3].slug).toBe("submission:s1");
    expect(corpus[3].publicSlug).toBeNull();
  });

  it("prefers the trip date over the date the row entered the system", () => {
    expect(corpus[0].sortDate).toBe("2023-05-01");
    expect(corpus[3].sortDate).toBe("2025-06-01");
  });
});

describe("portal buckets", () => {
  it("treats exactly the submitted and reviewing states as needing review", () => {
    expect([...NEEDS_REVIEW_SUBMISSION_STATUSES]).toEqual(["submitted", "reviewing"]);
    expect(corpus.filter((row) => bucketOf(row) === "needs").map((row) => row.id)).toEqual(["s1", "s2"]);
  });

  it("counts published rows as the published bucket and leaves the rest to All", () => {
    expect(countBucket(corpus, "needs")).toBe(2);
    expect(countBucket(corpus, "published")).toBe(3);
    expect(countBucket(corpus, "all")).toBe(7);

    // Accepted-but-unpromoted and spam sit in neither of the first two.
    const stranded = corpus.filter((row) => bucketOf(row) === "other").map((row) => row.id);
    expect(stranded).toEqual(["s3", "s4"]);
  });
});

describe("portal search and facets", () => {
  it("searches title, author, substance and tag together", () => {
    expect(rowMatchesQuery(corpus[0], "alpine")).toBe(true);
    expect(rowMatchesQuery(corpus[0], "nervewing")).toBe(true);
    expect(rowMatchesQuery(corpus[0], "lsd")).toBe(true);
    expect(rowMatchesQuery(corpus[0], "visual")).toBe(true);
    expect(rowMatchesQuery(corpus[0], "ketamine")).toBe(false);
    expect(rowMatchesQuery(corpus[0], "   ")).toBe(true);
  });

  it("counts facets over the whole corpus, ordered by frequency then name", () => {
    expect(countFacet(corpus, "substance").slice(0, 3)).toEqual([
      { value: "Ketamine", count: 3 },
      { value: "LSD", count: 2 },
      { value: "Cannabis", count: 1 },
    ]);
    expect(countFacet(corpus, "author")[0]).toEqual({ value: "anon", count: 2 });
    expect(countFacet(corpus, "tag")).toEqual([
      { value: "visual", count: 2 },
      { value: "combo", count: 1 },
    ]);
  });

  it("toggles a facet value on and back off without disturbing the others", () => {
    const once = toggleFacetValue(EMPTY_PORTAL_FACETS, "substance", "LSD");
    expect(once.substance).toEqual(["LSD"]);
    expect(activeFacetCount(once)).toBe(1);

    const both = toggleFacetValue(once, "author", "nervewing");
    expect(activeFacetCount(both)).toBe(2);

    const off = toggleFacetValue(both, "substance", "LSD");
    expect(off.substance).toEqual([]);
    expect(off.author).toEqual(["nervewing"]);
  });

  it("ORs within a facet and ANDs across facets", () => {
    const rows = filterPortalRows(corpus, {
      bucket: "all",
      query: "",
      sort: "title",
      facets: { substance: ["LSD", "Psilocybin"], author: ["nervewing"], tag: [] },
    });

    expect(rows.map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("applies the bucket, the query and the facets together", () => {
    const rows = filterPortalRows(corpus, {
      bucket: "published",
      query: "lsd",
      sort: "title",
      facets: EMPTY_PORTAL_FACETS,
    });

    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("portal sorting", () => {
  const published3 = corpus.filter((row) => row.origin === "published");

  it("sorts newest first by default and reverses for oldest", () => {
    expect(sortPortalRows(published3, "newest").map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(sortPortalRows(published3, "oldest").map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by title independently of date", () => {
    expect(sortPortalRows(published3, "title").map((row) => row.title)).toEqual([
      "Alpine clarity",
      "Blue hour",
      "Cellar door",
    ]);
  });
});

describe("portal grouping", () => {
  it("returns one unnamed group when grouping is off", () => {
    const groups = groupPortalRows(corpus, "none", "title");

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBeNull();
    expect(groups[0].rows).toHaveLength(corpus.length);
  });

  it("groups by year, newest year first", () => {
    const groups = groupPortalRows(corpus.filter((row) => row.origin === "published"), "date", "title");

    expect(groups.map((group) => group.name)).toEqual(["2024", "2023", "2021"]);
    expect(groups[0].rows.map((row) => row.id)).toEqual(["c"]);
  });

  it("defers to the shared engine, which buckets multi-substance reports as Combinations", () => {
    const groups = groupPortalRows(corpus.filter((row) => row.origin === "published"), "substance", "title");

    expect(groups.map((group) => group.name)).toContain("Combinations");
    const combinations = groups.find((group) => group.name === "Combinations");
    expect(combinations?.rows.map((row) => row.id)).toEqual(["b"]);
    // The two-substance report is not also listed under LSD.
    expect(groups.find((group) => group.name === "LSD")?.rows.map((row) => row.id)).toEqual(["a"]);
  });

  it("groups by author and obeys the portal's own sort inside each group", () => {
    const groups = groupPortalRows(corpus, "author", "oldest");
    const nervewing = groups.find((group) => group.name === "nervewing");

    expect(nervewing?.rows.map((row) => row.id)).toEqual(["a", "c"]);

    const newest = groupPortalRows(corpus, "author", "newest").find((group) => group.name === "nervewing");
    expect(newest?.rows.map((row) => row.id)).toEqual(["c", "a"]);
  });
});

describe("portal stats", () => {
  it("counts distinct bylines and substances across both origins", () => {
    expect(portalStats(corpus)).toEqual({ reports: 7, authors: 4, substances: 5 });
  });
});
