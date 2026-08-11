import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

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

describe("public report contributor attribution", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  it("filters contributor reports by contributor key, display name, and aliases", async () => {
    mocks.queryConvex
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

    expect(mocks.queryConvex).toHaveBeenCalledWith("tripReports:getAll", {});
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
      .mockResolvedValueOnce([
        {
          slug: "claimed-report",
          title: "Claimed Report",
          featured: false,
          subject: { name: "A Name Nobody Matches", profile_key: "author" },
          substances: [{ name: "LSD" }],
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
    mocks.queryConvex
      .mockResolvedValueOnce([
        {
          slug: "legacy-report",
          title: "Legacy Report",
          subject: { name: "nervewing" },
          substances: [],
        },
        {
          slug: "impersonating-report",
          title: "Impersonating Report",
          subject: { name: "nervewing" },
          substances: [],
          attribution_review: {
            reviewed_by: "editor@example.com",
            reviewed_at: "2026-06-11T12:00:00.000Z",
            decision: "declined",
          },
        },
        {
          slug: "granted-report",
          title: "Granted Report",
          subject: { name: "nervewing", profile_key: "NERVEWING" },
          substances: [],
          attribution_review: {
            reviewed_by: "editor@example.com",
            reviewed_at: "2026-06-11T12:00:00.000Z",
            decision: "assigned",
          },
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
    mocks.queryConvex
      .mockResolvedValueOnce([
        { slug: "first-word", title: "First Word", subject: { name: "Josie" }, substances: [] },
        { slug: "full-name", title: "Full Name", subject: { name: "josie kins" }, substances: [] },
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

    mocks.queryConvex
      .mockResolvedValueOnce(
        bylines.map((name, index) => ({
          slug: `report-${index}`,
          title: `Report ${index}`,
          subject: { name },
          substances: [],
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
