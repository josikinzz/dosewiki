import { describe, expect, it } from "vitest";
import { proposalComparableDocument } from "./proposalBaseline";

describe("proposalComparableDocument for about", () => {
  const stored = {
    _id: "about-id",
    key: "about",
    aboutMarkdown: "# About",
    aboutSubtitle: "Sub",
    founderProfileKeys: ["JOSIE"],
    updatedAt: "2026-01-01",
    updatedBy: "admin@example.com",
  };

  it("treats a row without translation credits like an empty credit map", () => {
    expect(proposalComparableDocument("about", stored)).toEqual(
      proposalComparableDocument("about", { ...stored, translationCredits: {} }),
    );
  });

  it("compares translation credits, so a stale baseline is caught", () => {
    const credited = { ...stored, translationCredits: { "zh-Hans": [{ profileKey: "VACUE", contribution: "Chinese localization" }] } };
    expect(proposalComparableDocument("about", credited)).not.toEqual(proposalComparableDocument("about", stored));
    expect(proposalComparableDocument("about", credited)).toMatchObject({ translationCredits: credited.translationCredits });
  });
});
