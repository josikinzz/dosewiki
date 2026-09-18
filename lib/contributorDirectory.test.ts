import { describe, expect, it } from "vitest";
import { resolveContributorHref, type ContributorDirectory } from "./contributorDirectory";

const directory: ContributorDirectory = [
  { key: "JOSIE", displayName: "Josie Kins", aliases: ["josie kinzz"] },
  { key: "LYREA", displayName: "Lyrea", aliases: [] },
];

describe("resolveContributorHref", () => {
  it("resolves an exact display-name hit", () => {
    expect(resolveContributorHref("Lyrea", directory)).toBe("/contributors/lyrea");
  });

  it("resolves an alias hit", () => {
    expect(resolveContributorHref("josie kinzz", directory)).toBe("/contributors/josie");
  });

  it("resolves a case-insensitive hit", () => {
    expect(resolveContributorHref("JOSIE KINS", directory)).toBe("/contributors/josie");
  });

  // A given name links to a contributor only when that contributor claims it as
  // an alias; the roster is too large for a first-word guess to be safe.
  it("returns null for an unclaimed first word of a display name", () => {
    expect(resolveContributorHref("Josie", directory)).toBeNull();
    expect(resolveContributorHref("Josie", [{ ...directory[0], aliases: ["josie"] }])).toBe(
      "/contributors/josie",
    );
  });

  it("returns null for a miss", () => {
    expect(resolveContributorHref("Someone Else", directory)).toBeNull();
  });
});
