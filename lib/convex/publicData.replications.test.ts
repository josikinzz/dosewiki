import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectReplicationsByArtistNames } from "../../convex/replications";
import { contributorMatchNames } from "../contributorProfileIdentity";
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

const row = (artist: string) => ({ slug: artist.toLowerCase(), artist });

describe("replication contributor matching", () => {
  const rows = [
    row("Josie Kins"),
    row("josie kins"),
    row("Unity"),
    row("Someone Else"),
    row("Unknown"),
    row("various artists"),
    row("midjourney"),
  ];

  it("matches a contributor across an exact-cased display name and a lowercase alias", () => {
    const profile = contributor({
      key: "JOSIE",
      displayName: "Josie Kins",
      aliases: ["unity"],
    });

    expect(
      selectReplicationsByArtistNames(rows, contributorMatchNames(profile)).map((item) => item.artist),
    ).toEqual(["Josie Kins", "josie kins", "Unity"]);
  });

  it("never joins unattributed markers, even to a profile aliased with one", () => {
    const impostor = contributor({
      key: "IMPOSTOR",
      displayName: "Unknown",
      aliases: ["various artists", "midjourney"],
    });

    expect(selectReplicationsByArtistNames(rows, contributorMatchNames(impostor))).toEqual([]);
    expect(selectReplicationsByArtistNames(rows, ["Unknown"])).toEqual([]);
    expect(selectReplicationsByArtistNames(rows, ["  UNKNOWN  "])).toEqual([]);
  });

  it("keeps a marker in the name list from dragging in unrelated works", () => {
    expect(
      selectReplicationsByArtistNames(rows, ["unknown", "Unity"]).map((item) => item.artist),
    ).toEqual(["Unity"]);
  });

  it("returns nothing rather than everything when a contributor has no usable names", () => {
    expect(selectReplicationsByArtistNames(rows, [])).toEqual([]);
    expect(selectReplicationsByArtistNames(rows, ["", "   "])).toEqual([]);
  });
});

describe("getReplicationsByContributor", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  it("asks Convex for the contributor's own works by normalized match name", async () => {
    mocks.queryConvex.mockResolvedValueOnce([{ slug: "drifting", artist: "Josie Kins", url: "https://x/1" }]);

    const { getReplicationsByContributor } = await import("./publicData.replications");
    const replications = await getReplicationsByContributor(
      contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["Josie", "josie kins"] }),
    );

    expect(mocks.queryConvex).toHaveBeenCalledTimes(1);
    expect(mocks.queryConvex).toHaveBeenCalledWith("replications:getByArtistNames", {
      artistNames: ["josie kins", "josie"],
    });
    expect(replications).toEqual([{ slug: "drifting", artist: "Josie Kins", url: "https://x/1" }]);
  });

  it("returns an empty list for a contributor with no works", async () => {
    mocks.queryConvex.mockResolvedValueOnce([]);

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "NOBODY", displayName: "Nobody" })),
    ).resolves.toEqual([]);
  });

  it("skips the read entirely when a profile carries no matchable name", async () => {
    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "BLANK", displayName: "" })),
    ).resolves.toEqual([]);
    expect(mocks.queryConvex).not.toHaveBeenCalled();
  });

  it("degrades to no works when the additive Convex query is not deployed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.queryConvex.mockRejectedValueOnce(
      new Error("[CONVEX Q(replications:getByArtistNames)] Could not find public function"),
    );

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "JOSIE", displayName: "Josie Kins" })),
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("surfaces any other Convex failure instead of pretending the portfolio is empty", async () => {
    mocks.queryConvex.mockRejectedValueOnce(
      new Error("[CONVEX Q(replications:getByArtistNames)] Server Error"),
    );

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "JOSIE", displayName: "Josie Kins" })),
    ).rejects.toThrow("Server Error");
  });
});
