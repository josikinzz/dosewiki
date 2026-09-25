import { describe, expect, it } from "vitest";

import { summarizePlaylistChange } from "./playlistsModel";

const TITLES: Record<string, string> = { alpha: "Alpha", beta: "Beta", gamma: "Gamma" };
const labelOf = (slug: string) => TITLES[slug] ?? slug;

describe("summarizePlaylistChange", () => {
  it("describes a new playlist by its works in order", () => {
    expect(
      summarizePlaylistChange({ before: null, after: { title: "Opener", slugs: ["beta", "alpha"] }, labelOf, unavailable: new Set() }),
    ).toEqual({ lines: ['Creates "Opener" with 2 works.', "In order: Beta, Alpha."], leftOut: [] });
  });

  it("names renames, additions, removals and reorders in words", () => {
    const summary = summarizePlaylistChange({
      before: { title: "Old", slugs: ["alpha", "beta", "gamma"] },
      after: { title: "New", slugs: ["gamma", "alpha", "delta"] },
      labelOf,
      unavailable: new Set(),
    });
    expect(summary.lines).toEqual([
      'Renames "Old" to "New".',
      "Adds delta.",
      "Removes Beta.",
      "Changes the order.",
      "The playlist keeps 3 works.",
    ]);
  });

  it("lists entries a save would leave out instead of counting them as kept", () => {
    const summary = summarizePlaylistChange({
      before: { title: "List", slugs: ["alpha"] },
      after: { title: "List", slugs: ["alpha", "retired-work"] },
      labelOf,
      unavailable: new Set(["retired-work"]),
    });
    expect(summary.leftOut).toEqual(["retired-work"]);
    expect(summary.lines).toEqual(["The playlist keeps 1 work."]);
  });
});
