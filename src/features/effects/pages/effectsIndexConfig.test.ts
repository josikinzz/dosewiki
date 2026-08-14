import { describe, expect, it } from "vitest";

import { parseTabIdFromHash } from "./effectsIndexConfig";

describe("parseTabIdFromHash", () => {
  it("resolves every tab id", () => {
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
    // The gallery is no longer a tab of this index — it moved to /replications.
    // The explorer redirects the old fragment before this parser ever sees it,
    // but the parser itself must treat it as just another unknown fragment.
    expect(parseTabIdFromHash("#gallery")).toBeNull();
  });
});
