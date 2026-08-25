import { describe, expect, it } from "vitest";

import { moleculeImageUrlForAppearance } from "./moleculeOverrideUrl";

describe("moleculeImageUrlForAppearance", () => {
  it("keys the byte colorway on the color scheme alone", () => {
    expect(
      moleculeImageUrlForAppearance("/api/molecules/classes/tryptamine?v=1", "light"),
    ).toBe("/api/molecules/classes/tryptamine?v=1&colorway=pro-light");
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "dark")).toBe(
      "/api/molecules/lsd?v=1&colorway=pro-dark",
    );
  });

  it("adds the colorway to unversioned dynamic image routes", () => {
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd", "light")).toBe(
      "/api/molecules/lsd?colorway=pro-light",
    );
  });

  it("does not rewrite unrelated images", () => {
    expect(moleculeImageUrlForAppearance("/images/logo.svg", "dark")).toBe(
      "/images/logo.svg",
    );
  });
});

