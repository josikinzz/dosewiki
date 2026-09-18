import { describe, expect, it } from "vitest";
import { applyPlaylistToCuration, playlistKeyOf } from "./replicationPlaylistModel";

describe("playlistKeyOf", () => {
  it("mints a kebab-case key from a display name", () => {
    expect(playlistKeyOf("Classic Psychedelic Opener")).toBe("classic-psychedelic-opener");
  });

  it("collapses punctuation and trims the edges", () => {
    expect(playlistKeyOf("  2C-x / tryptamines!  ")).toBe("2c-x-tryptamines");
  });
});

describe("applyPlaylistToCuration", () => {
  it("appends the playlist after existing curation, in playlist order", () => {
    const result = applyPlaylistToCuration({
      curated: ["own-pick"],
      removed: [],
      playlistSlugs: ["opener", "second"],
    });
    expect(result.curated).toEqual(["own-pick", "opener", "second"]);
    expect(result.added).toEqual(["opener", "second"]);
  });

  it("leaves an already-curated work in the position the editor gave it", () => {
    const result = applyPlaylistToCuration({
      curated: ["second", "own-pick"],
      removed: [],
      playlistSlugs: ["opener", "second"],
    });
    expect(result.curated).toEqual(["second", "own-pick", "opener"]);
    expect(result.added).toEqual(["opener"]);
  });

  it("never resurrects a work excluded from this gallery", () => {
    const result = applyPlaylistToCuration({
      curated: [],
      removed: ["junk"],
      playlistSlugs: ["opener", "junk"],
    });
    expect(result.curated).toEqual(["opener"]);
    expect(result.skippedExcluded).toEqual(["junk"]);
  });

  it("applies the same playlist twice without duplicating anything", () => {
    const once = applyPlaylistToCuration({
      curated: [],
      removed: [],
      playlistSlugs: ["a", "b"],
    });
    const twice = applyPlaylistToCuration({
      curated: once.curated,
      removed: [],
      playlistSlugs: ["a", "b"],
    });
    expect(twice.curated).toEqual(["a", "b"]);
    expect(twice.added).toEqual([]);
    expect(twice.alreadyPresent).toEqual(["a", "b"]);
  });
});
