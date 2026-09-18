import { describe, expect, it } from "vitest";

import {
  EMPTY_STUDIO_FACETS,
  NO_EFFECT_KEY,
  activeFacetCount,
  buildReplicationSlug,
  facetCounts,
  fileFormat,
  filterStudioRows,
  formatDuration,
  groupStudioRows,
  inferMediaType,
  isValidReplicationSlug,
  kebab,
  titleFromFileName,
  toggleFacetValue,
  type StudioRow,
} from "./replicationStudioModel";

function row(overrides: Partial<StudioRow> & Pick<StudioRow, "slug">): StudioRow {
  return {
    id: `id-${overrides.slug}`,
    title: "Untitled",
    artist: "Unknown",
    artist_url: null,
    role: "replication",
    type: "image",
    effect_slug: "geometry",
    effect_name: "Geometry",
    effect_tags: [],
    credit_line: null,
    url: null,
    thumbnail_url: null,
    format: "jpg",
    duration: null,
    file_size: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const CORPUS: StudioRow[] = [
  row({ slug: "a", title: "Kaleidoscope", artist: "Chelsea Morgan", type: "image" }),
  row({ slug: "b", title: "Drifting walls", artist: "Chelsea Morgan", type: "video", effect_slug: "drifting", effect_name: "Drifting" }),
  row({ slug: "c", title: "Droning tones", artist: "Symmetric Vision", type: "audio", effect_slug: "drifting", effect_name: "Drifting" }),
  row({ slug: "d", title: "ECG trace", artist: "Josie Kins", role: "figure", effect_slug: null, effect_name: null }),
];

const EFFECT_NAMES = new Map([
  ["geometry", "Geometry"],
  ["drifting", "Drifting"],
]);

describe("filterStudioRows", () => {
  const base = { query: "", group: "none" as const, facets: EMPTY_STUDIO_FACETS };

  it("returns the whole corpus when nothing is asked of it", () => {
    expect(filterStudioRows(CORPUS, base)).toHaveLength(4);
  });

  it("searches title, artist, slug, and effect", () => {
    expect(filterStudioRows(CORPUS, { ...base, query: "chelsea" }).map((r) => r.slug)).toEqual(["a", "b"]);
    expect(filterStudioRows(CORPUS, { ...base, query: "Drifting" }).map((r) => r.slug)).toEqual(["b", "c"]);
    expect(filterStudioRows(CORPUS, { ...base, query: "  ECG " }).map((r) => r.slug)).toEqual(["d"]);
  });

  it("unions values inside a facet and intersects across facets", () => {
    const facets = { ...EMPTY_STUDIO_FACETS, type: ["image", "audio"] };
    expect(filterStudioRows(CORPUS, { ...base, facets }).map((r) => r.slug)).toEqual(["a", "c", "d"]);

    const narrowed = { ...facets, artist: ["Chelsea Morgan"] };
    expect(filterStudioRows(CORPUS, { ...base, facets: narrowed }).map((r) => r.slug)).toEqual(["a"]);
  });

  it("files effect-less rows under the no-effect key rather than dropping them", () => {
    const facets = { ...EMPTY_STUDIO_FACETS, effect: [NO_EFFECT_KEY] };
    expect(filterStudioRows(CORPUS, { ...base, facets }).map((r) => r.slug)).toEqual(["d"]);
  });
});

describe("groupStudioRows", () => {
  it("returns one unlabelled group when ungrouped", () => {
    const groups = groupStudioRows(CORPUS, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
    expect(groups[0].rows).toHaveLength(4);
  });

  it("orders groups by size then label", () => {
    const groups = groupStudioRows(CORPUS, "effect");
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ["Drifting", 2],
      ["Geometry", 1],
      ["No effect", 1],
    ]);
  });

  it("title-cases the type group labels", () => {
    expect(groupStudioRows(CORPUS, "type").map((g) => g.label).sort()).toEqual(["Audio", "Image", "Video"]);
  });
});

describe("facetCounts", () => {
  it("counts over the whole corpus and names effects", () => {
    expect(facetCounts(CORPUS, "effect", EFFECT_NAMES)).toEqual([
      { key: "drifting", label: "Drifting", count: 2 },
      { key: "geometry", label: "Geometry", count: 1 },
      { key: NO_EFFECT_KEY, label: "No effect", count: 1 },
    ]);
  });

  it("counts roles with their absent-means-replication default already resolved", () => {
    expect(facetCounts(CORPUS, "role", EFFECT_NAMES)).toEqual([
      { key: "replication", label: "Replication", count: 3 },
      { key: "figure", label: "Figure", count: 1 },
    ]);
  });
});

describe("toggleFacetValue", () => {
  it("adds then removes without touching sibling kinds", () => {
    const once = toggleFacetValue(EMPTY_STUDIO_FACETS, "type", "video");
    expect(once.type).toEqual(["video"]);
    expect(activeFacetCount(once)).toBe(1);

    const twice = toggleFacetValue(once, "type", "video");
    expect(twice.type).toEqual([]);
    expect(activeFacetCount(twice)).toBe(0);
  });
});

describe("buildReplicationSlug", () => {
  it("joins a kebab title with the artist", () => {
    expect(buildReplicationSlug("Colourful Welsh Woods", "Chelsea Morgan", [])).toBe(
      "colourful-welsh-woods-chelsea-morgan",
    );
  });

  it("folds diacritics and punctuation the way the stored slugs already read", () => {
    expect(buildReplicationSlug("Untitled", "Zdzisław Beksiński", [])).toBe("untitled-zdzislaw-beksinski");
    expect(buildReplicationSlug("Faces on a Tree!", "/u/HSD_5", [])).toBe("faces-on-a-tree-u-hsd-5");
  });

  it("suffixes rather than shadowing an existing slug", () => {
    const taken = ["untitled-loka", "untitled-loka-2"];
    expect(buildReplicationSlug("Untitled", "Loka", taken)).toBe("untitled-loka-3");
  });

  it("never returns a blank slug", () => {
    expect(buildReplicationSlug("???", "", [])).toBe("untitled-media");
  });

  it("only produces slugs Postgres will accept", () => {
    for (const [title, artist] of [["Untitled", "Zdzisław Beksiński"], ["  ", "//"], ["A—B", "C"]]) {
      expect(isValidReplicationSlug(buildReplicationSlug(title, artist, []))).toBe(true);
    }
  });
});

describe("upload helpers", () => {
  it("infers the media type from MIME first, then the filename", () => {
    expect(inferMediaType({ type: "video/mp4", name: "clip.mp4" })).toBe("video");
    expect(inferMediaType({ type: "audio/mpeg", name: "tone.mp3" })).toBe("audio");
    expect(inferMediaType({ type: "", name: "tone.MP3" })).toBe("audio");
    expect(inferMediaType({ type: "image/webp", name: "still.webp" })).toBe("image");
    expect(inferMediaType({ type: "", name: "mystery" })).toBe("image");
  });

  it("reads a lowercase dotless format off the filename", () => {
    expect(fileFormat("Clip.MP4")).toBe("mp4");
    expect(fileFormat("no-extension")).toBe("noextension");
  });

  it("turns a filename into a starting title", () => {
    expect(titleFromFileName("colour_shift-01.jpg")).toBe("colour shift 01");
  });

  it("formats durations as minutes and padded seconds", () => {
    expect(formatDuration(74)).toBe("1:14");
    expect(formatDuration(null)).toBeNull();
  });

  it("kebabs to the same shape the slug builder uses", () => {
    expect(kebab("  Mixed Case — Text ")).toBe("mixed-case-text");
  });
});
