import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { createDataPublicDataReadAdapter } from "./publicData.reads";

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki_test");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

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
  queryData: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryData: mocks.queryData,
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


describe("public report contributor attribution", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryData.mockReset();
    cacheTrace.entered.length = 0;
  });

  it("filters contributor reports by contributor key, display name, and aliases", async () => {
    mocks.queryData
      .mockResolvedValueOnce([
        {
          slug: "z-report",
          title: "Z Report",
          featured: false,
          subject: { name: "Unknown" },
          substances: [{ name: "Psilocybin" }],
          introduction: "Unknown author report",
        },
        {
          slug: "legacy-report",
          title: "Legacy Report",
          featured: true,
          subject: { name: "Old Name" },
          substances: [{ name: "LSD" }],
          introduction: "Report body",
        },
      ])
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
    mocks.queryData
      .mockResolvedValueOnce([
        {
          slug: "claimed-report",
          title: "Claimed Report",
          featured: false,
          subject: { name: "A Name Nobody Matches", profile_key: "author" },
          substances: [{ name: "LSD" }],
          excerpt: "",
        },
      ])
      .mockResolvedValueOnce([]);

    const { getReportsByContributor } = await import("./publicData.reports");
    const reports = await getReportsByContributor(contributor({ key: "AUTHOR", displayName: "New Name" }));

    expect(reports.map((report) => report.slug)).toEqual(["claimed-report"]);
  });

  it("keeps a reviewed report off a contributor's page when only the byline matches", async () => {
    // A promoted submission carries the review marker, so its byline is a name
    // an anonymous person typed. The legacy report beside it has no marker and
    // still belongs to the contributor by name, as the whole corpus does.
    mocks.queryData
      .mockResolvedValueOnce([
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
      ])
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
    mocks.queryData
      .mockResolvedValueOnce([
        { slug: "first-word", title: "First Word", subject: { name: "Josie" }, substances: [], excerpt: "" },
        { slug: "full-name", title: "Full Name", subject: { name: "josie kins" }, substances: [], excerpt: "" },
      ])
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

    mocks.queryData
      .mockResolvedValueOnce(
        bylines.map((name, index) => ({
          slug: `report-${index}`,
          title: `Report ${index}`,
          subject: { name },
          substances: [],
          excerpt: "",
        })),
      )
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


describe("public report preview and detail pagination", () => {
  it("reads the compact browse projection once and drains complete open-data detail pages", async () => {
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
      if (name === "tripReports:getPublicBrowseIndex") return previewRows as Result;
      const secondPage = args.cursor === "page-2";
      return {
        items: secondPage ? detailRows.slice(2) : detailRows.slice(0, 2),
        cursor: secondPage ? "done" : "page-2",
        isDone: secondPage,
      } as Result;
    };
    const adapter = createDataPublicDataReadAdapter(query);

    const previews = await adapter.getPublicTripReportPreviews();
    const details = await adapter.getPublicTripReportRecords();

    expect(previews).toEqual(previewRows);
    expect(previews.every((row) => !("introduction" in row) && !("conclusion" in row))).toBe(true);
    expect(previews.every((row) => !("onset" in row) && !("peak" in row) && !("offset" in row))).toBe(true);
    expect(details).toEqual(detailRows);
    expect(details.every((row) => row.introduction === longNarrative && row.onset.length === 1)).toBe(true);
    expect(calls).toEqual([
      { name: "tripReports:getPublicBrowseIndex", args: {} },
      { name: "tripReports:getPublicDetailsPage", args: { limit: 32 } },
      { name: "tripReports:getPublicDetailsPage", args: { cursor: "page-2", limit: 32 } },
    ]);
  });

  it("drains bounded search summaries without full detail or contributor reads", async () => {
    vi.resetModules();
    mocks.queryData.mockReset();
    const introduction = `  Raw introduction.\n\n${"Not a preview excerpt. ".repeat(30)}\n`;
    const summaries = [
      { slug: "first", title: "First", introduction },
      { slug: "second", title: "Second" },
    ];
    mocks.queryData.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name !== "tripReports:getPublicPreviewsPage" || args.includeSearchSummary !== true || args.limit !== 32) {
        throw new Error("Search summaries must use the bounded summary projection");
      }
      if (args.cursor === undefined) {
        return { items: summaries.slice(0, 1), cursor: "next", isDone: false };
      }
      if (args.cursor === "next") {
        return { items: summaries.slice(1), cursor: "done", isDone: true };
      }
      throw new Error("Unexpected search summary cursor");
    });

    // Reload after resetting modules so the leaf binds this test's transport and cache mocks.
    const { getPublicReportSearchSummaries } = await import("./publicData.reports");
    expect(await getPublicReportSearchSummaries()).toEqual(summaries);
  });
});
