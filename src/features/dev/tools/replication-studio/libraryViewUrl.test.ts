import { describe, expect, it } from "vitest";

import { DEFAULT_LIBRARY_VIEW, readLibraryView, writeLibraryView } from "./libraryViewUrl";

describe("libraryViewUrl", () => {
  it("round-trips a filtered, grouped view, keeping artist names with commas whole", () => {
    const state = {
      query: "spiral",
      group: "effect" as const,
      facets: { type: ["video"], role: [], artist: ["Smith, Jane", "Hypnagogist"], effect: ["geometry"] },
      view: "list" as const,
      density: "compact" as const,
    };
    const params = writeLibraryView(new URLSearchParams(), state);
    expect(readLibraryView(`?${params.toString()}`)).toEqual(state);
  });

  it("leaves defaults and other tools' params alone", () => {
    const params = writeLibraryView(new URLSearchParams("tab=x&group=type"), DEFAULT_LIBRARY_VIEW);
    expect(params.toString()).toBe("tab=x");
  });

  it("falls back to the defaults for values it does not know", () => {
    expect(readLibraryView("?group=colour&view=cards&density=huge")).toEqual(DEFAULT_LIBRARY_VIEW);
  });
});
