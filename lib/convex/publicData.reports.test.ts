import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { createConvexPublicDataReadAdapter } from "./publicData.reads";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
const cacheTrace = vi.hoisted(() => ({ entered: [] as string[] }));
vi.mock("next/cache", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const inside = new AsyncLocalStorage<string>();
  return {
    unstable_cache: <T extends (...args: never[]) => Promise<unknown>>(fn: T, keyParts: string[] = []) =>
      ((...args: Parameters<T>) => {
        const key = keyParts[0] ?? "<unkeyed>";
        const outer = inside.getStore();
        if (outer) {
          throw new Error(`unstable_cache "${key}" entered from inside unstable_cache "${outer}"; Next bypasses the inner one`);
        }
        cacheTrace.entered.push(key);
        return inside.run(key, () => fn(...args));
      }) as unknown as T,
  };
});

const mocks = vi.hoisted(() => ({
  queryConvex: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryConvex: mocks.queryConvex,
}));

const contributor = (
  overrides: { key: string; displayName: string; aliases?: string[] },
): NormalizedUserProfile => ({
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
  ...overrides,
});

const page = <T>(items: T[]) => ({ items, cursor: "done", isDone: true });

describe("public report contributor attribution", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
    cacheTrace.entered.length = 0;
  });

  it("filters contributor reports by contributor key, display name, and aliases", async () => {
    mocks.queryConvex
      .mockResolvedValueOnce(page([
        {
          slug: "z-report",
          title: "Z Report",
          featured: false,
          subject: { name: "Unknown" },
          substances: [{ name: "Psilocybin" }],
          excerpt: "Unknown author report",
        },
        {
          slug: "legacy-report",
          title: "Legacy Report",
          featured: true,
          subject: { name: "Old Name" },
          substances: [{ name: "LSD" }],
          excerpt: "Report body",
        },
      ]))
      .mockResolvedValueOnce([
        {
          key: "AUTHOR",
          displayName: "New Name",
          aliases: ["old name"],
          avatarUrl: "https://example.com/avatar.png",
          bio: "",
          links: [],
          hasCustomBio: false,
        },
      ]);

    const { getReportsByContributor } = await import("./publicData.reports");
    const reports = await getReportsByContributor({
      key: "AUTHOR",
      displayName: "New Name",
      aliases: ["old name"],
      avatarUrl: "https://example.com/avatar.png",
      bio: "",
      links: [],
      hasCustomBio: false,
    });

    expect(mocks.queryConvex).toHaveBeenCalledWith("tripReports:getPublicPreviewsPage", {
      limit: 32,
    });
    expect(reports).toEqual([
      {
        title: "Legacy Report",
        slug: "legacy-report",
          author: "Old Name",
          featured: true,
          substanceNames: ["LSD"],
          substances: [{ name: "LSD" }],
          introduction: "Report body",
          tripDate: undefined,
          age: undefined,
          gender: undefined,
          height: undefined,
          weight: undefined,
          medications: undefined,
          setting: undefined,
          authorAvatarUrl: "https://example.com/avatar.png",
          authorProfileKey: "AUTHOR",
        },
    ]);
  });

  it("keeps a stored profile key ahead of the byline", async () => {
    mocks.queryConvex
      .mockResolvedValueOnce(page([
        {
          slug: "claimed-report",
          title: "Claimed Report",
          featured: false,
          subject: { name: "A Name Nobody Matches", profile_key: "author" },
          substances: [{ name: "LSD" }],
          excerpt: "",
        },
      ]))
      .mockResolvedValueOnce([]);

    const { getReportsByContributor } = await import("./publicData.reports");
    const reports = await getReportsByContributor(contributor({ key: "AUTHOR", displayName: "New Name" }));

    expect(reports.map((report) => report.slug)).toEqual(["claimed-report"]);
  });

  it("keeps a reviewed report off a contributor's page when only the byline matches", async () => {
    // A promoted submission carries the review marker, so its byline is a name
    // an anonymous person typed. The legacy report beside it has no marker and
    // still belongs to the contributor by name, as the whole corpus does.
    mocks.queryConvex
      .mockResolvedValueOnce(page([
        {
          slug: "legacy-report",
          title: "Legacy Report",
          subject: { name: "nervewing" },
          substances: [],
          excerpt: "",
        },
        {
          slug: "impersonating-report",
          title: "Impersonating Report",
          subject: { name: "nervewing" },
          substances: [],
          excerpt: "",
          attribution_locked: true,
        },
        {
          slug: "granted-report",
          title: "Granted Report",
          subject: { name: "nervewing", profile_key: "NERVEWING" },
          substances: [],
          excerpt: "",
          attribution_locked: true,
        },
      ]))
      .mockResolvedValueOnce([]);

    const { getReportsByContributor } = await import("./publicData.reports");
    const reports = await getReportsByContributor(
      contributor({ key: "NERVEWING", displayName: "nervewing" }),
    );

    expect(reports.map((report) => report.slug)).toEqual(["granted-report", "legacy-report"]);
  });

  // The byline "Josie" belongs to whoever claims it as an alias, not to whoever
  // happens to be first-named "Josie Kins".
  it("ignores a byline that is only the first word of the contributor's display name", async () => {
    mocks.queryConvex
      .mockResolvedValueOnce(page([
        { slug: "first-word", title: "First Word", subject: { name: "Josie" }, substances: [], excerpt: "" },
        { slug: "full-name", title: "Full Name", subject: { name: "josie kins" }, substances: [], excerpt: "" },
      ]))
      .mockResolvedValueOnce([]);

    const { getReportsByContributor } = await import("./publicData.reports");
    const reports = await getReportsByContributor(contributor({ key: "JOSIE", displayName: "Josie Kins" }));

    expect(reports.map((report) => report.slug)).toEqual(["full-name"]);
  });

  it("agrees with the report-to-profile matcher about the same author", async () => {
    const bylines = ["Josie", "Josie Kins", "josikinz", "Josephine", "Kaylee"];
    const profile = contributor({
      key: "JOSIE",
      displayName: "Josie Kins",
      aliases: ["josie", "josikinz"],
    });

    mocks.queryConvex
      .mockResolvedValueOnce(page(
        bylines.map((name, index) => ({
          slug: `report-${index}`,
          title: `Report ${index}`,
          subject: { name },
          substances: [],
          excerpt: "",
        })),
      ))
      .mockResolvedValueOnce([]);

    const { getReportsByContributor } = await import("./publicData.reports");
    const { findProfileByAuthorNameInList } = await import("../../src/data/userProfiles");

    const reports = await getReportsByContributor(profile);

    for (const byline of bylines) {
      expect(reports.some((report) => report.author === byline)).toBe(
        findProfileByAuthorNameInList([profile], byline)?.key === profile.key,
      );
    }
  });
});

describe("public report cache layering", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
    cacheTrace.entered.length = 0;
  });

  it("persists the trip report leaf and the contributor profile leaf as sibling unstable_cache entries", async () => {
    // Next bypasses an `unstable_cache` reached from inside another one, so the
    // exported reads must be request-scoped compositions over persisted leaves.
    // The next/cache mock above throws on any nested entry; this case pins the
    // two leaves the report list joins.
    mocks.queryConvex
      .mockResolvedValueOnce({ items: [], cursor: "done", isDone: true })
      .mockResolvedValueOnce([]);
    const { getPublicReports } = await import("./publicData.reports");
    await getPublicReports();
    expect(cacheTrace.entered).toEqual(["convex-public-trip-report-preview-records-v1", "convex-public-contributor-profiles"]);
  });
});

describe("public report preview and detail pagination", () => {
  it("drains compact preview pages separately from complete open-data detail pages", async () => {
    const longNarrative = "narrative ".repeat(2_000);
    const longTimeline = [{ time: "T+1:00", description: "timeline ".repeat(1_000) }];
    const previewRows = [
      {
        slug: "featured-z",
        title: "Z Featured",
        featured: true,
        subject: { name: "Legacy Alias", trip_date: "2024-01-01" },
        substances: [{ name: "LSD", dose: "100 µg", route: "sublingual" }],
        excerpt: "narrative ".repeat(17).trim(),
        published_at: "2026-01-01T00:00:00.000Z",
        attribution_locked: false,
      },
      {
        slug: "featured-a",
        title: "A Featured",
        featured: true,
        subject: { name: "Reviewed", profile_key: "REVIEWED" },
        substances: [{ name: "Psilocybin", dose: "2 g", route: "oral" }],
        excerpt: "Reviewed excerpt",
        attribution_locked: true,
      },
      {
        slug: "locked",
        title: "Locked",
        subject: { name: "Legacy Alias" },
        substances: [],
        excerpt: "Locked excerpt",
        attribution_locked: true,
      },
    ];
    const detailRows = previewRows.map((row) => ({
      slug: row.slug,
      title: row.title,
      featured: row.featured,
      subject: row.subject,
      substances: row.substances,
      introduction: longNarrative,
      onset: longTimeline,
      peak: longTimeline,
      offset: longTimeline,
      conclusion: longNarrative,
      tags: ["fixture"],
      license: "author-retained",
      attribution_locked: row.attribution_locked,
      published_at: row.published_at,
    }));
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const query = async <Result>(name: string, args: Record<string, unknown>): Promise<Result> => {
      calls.push({ name, args });
      const rows = name === "tripReports:getPublicPreviewsPage" ? previewRows : detailRows;
      const secondPage = args.cursor === "page-2";
      return {
        items: secondPage ? rows.slice(2) : rows.slice(0, 2),
        cursor: secondPage ? "done" : "page-2",
        isDone: secondPage,
      } as Result;
    };
    const adapter = createConvexPublicDataReadAdapter(query);

    const previews = await adapter.getPublicTripReportPreviews();
    const details = await adapter.getPublicTripReportRecords();

    expect(previews).toEqual(previewRows);
    expect(previews.every((row) => !("introduction" in row))).toBe(true);
    expect(previews.every((row) => !("onset" in row) && !("peak" in row) && !("offset" in row))).toBe(true);
    expect(previews.every((row) => !("conclusion" in row))).toBe(true);
    expect(details).toEqual(detailRows);
    expect(details.every((row) => row.introduction === longNarrative)).toBe(true);
    expect(details.every((row) => row.onset.length === 1)).toBe(true);
    expect(calls).toEqual([
      { name: "tripReports:getPublicPreviewsPage", args: { limit: 32 } },
      { name: "tripReports:getPublicPreviewsPage", args: { cursor: "page-2", limit: 32 } },
      { name: "tripReports:getPublicDetailsPage", args: { limit: 32 } },
      { name: "tripReports:getPublicDetailsPage", args: { cursor: "page-2", limit: 32 } },
    ]);
  });
});
