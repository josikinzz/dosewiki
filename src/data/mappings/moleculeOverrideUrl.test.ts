import { describe, expect, it } from "vitest";

import { moleculeImageUrlForAppearance } from "./moleculeOverrideUrl";

describe("moleculeImageUrlForAppearance", () => {
  it("leaves canonical Fun URLs untouched in either color scheme", () => {
    expect(moleculeImageUrlForAppearance("/molecules/classes/tryptamine.svg", "fun", "light")).toBe(
      "/molecules/classes/tryptamine.svg",
    );
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "fun", "dark")).toBe(
      "/api/molecules/lsd?v=1",
    );
  });

  it("selects the Pro light and dark static directories", () => {
    expect(moleculeImageUrlForAppearance("/molecules/classes/tryptamine.svg", "pro", "light")).toBe(
      "/molecules-ei/classes/tryptamine.svg",
    );
    expect(
      moleculeImageUrlForAppearance("/molecules-ei/classes/tryptamine.svg", "pro", "dark"),
    ).toBe("/molecules-ei-dark/classes/tryptamine.svg");
  });

  it("adds the requested Pro byte colorway to dynamic image routes", () => {
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd", "pro", "light")).toBe(
      "/api/molecules/lsd?colorway=pro-light",
    );
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "pro", "dark")).toBe(
      "/api/molecules/lsd?v=1&colorway=pro-dark",
    );
  });

  it("does not rewrite unrelated images", () => {
    expect(moleculeImageUrlForAppearance("/images/logo.svg", "pro", "dark")).toBe(
      "/images/logo.svg",
    );
  });
});
