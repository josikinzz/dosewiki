import { describe, expect, it } from "vitest";

import { parseTabIdFromHash } from "./effectsIndexConfig";

describe("parseTabIdFromHash", () => {
  it("resolves the gallery fragment the replications landing page links to", () => {
    expect(parseTabIdFromHash("#gallery")).toBe("gallery");
    expect(parseTabIdFromHash("gallery")).toBe("gallery");
    expect(parseTabIdFromHash("#GALLERY")).toBe("gallery");
  });

  it("resolves every other tab id", () => {
    expect(parseTabIdFromHash("#sensory")).toBe("sensory");
    expect(parseTabIdFromHash("#cognitive")).toBe("cognitive");
    expect(parseTabIdFromHash("#physical")).toBe("physical");
    expect(parseTabIdFromHash("#all")).toBe("all");
  });

  it("returns null for anything that is not a tab so the caller keeps its default", () => {
    expect(parseTabIdFromHash("")).toBeNull();
    expect(parseTabIdFromHash(null)).toBeNull();
    expect(parseTabIdFromHash(undefined)).toBeNull();
    expect(parseTabIdFromHash("#some-effect-anchor")).toBeNull();
  });
});
