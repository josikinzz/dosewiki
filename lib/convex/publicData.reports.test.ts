import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
