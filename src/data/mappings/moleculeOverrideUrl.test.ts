import { describe, expect, it } from "vitest";

import { moleculeImageUrlForAppearance } from "./moleculeOverrideUrl";

describe("moleculeImageUrlForAppearance", () => {
  it("leaves saturated Fun URLs untouched in either color scheme", () => {
    expect(
      moleculeImageUrlForAppearance("/api/molecules/classes/tryptamine?v=1", "fun", "light", 0.65),
    ).toBe("/api/molecules/classes/tryptamine?v=1");
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "fun", "dark", 0.4)).toBe(
      "/api/molecules/lsd?v=1",
    );
  });

  it("treats null as the site-default level, which is saturated and stays brand", () => {
    expect(
      moleculeImageUrlForAppearance("/api/molecules/classes/tryptamine?v=1", "fun", "light", null),
    ).toBe("/api/molecules/classes/tryptamine?v=1");
  });

  it("borrows Pro Dark bytes when the accent is fully desaturated on Fun", () => {
    expect(
      moleculeImageUrlForAppearance("/api/molecules/classes/tryptamine?v=1", "fun", "light", 0),
    ).toBe("/api/molecules/classes/tryptamine?v=1&colorway=pro-dark");
    expect(
      moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "fun", "dark", 0),
    ).toBe("/api/molecules/lsd?v=1&colorway=pro-dark");
  });

  it("keeps the barest trace of saturation on the brand colourway", () => {
    // The borrow triggers on exactly zero — grey — not on "low".
    expect(
      moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "fun", "dark", 0.01),
    ).toBe("/api/molecules/lsd?v=1");
  });

  it("versions class structure routes onto the requested Pro colorway", () => {
    expect(
      moleculeImageUrlForAppearance("/api/molecules/classes/tryptamine?v=1", "pro", "light", null),
    ).toBe("/api/molecules/classes/tryptamine?v=1&colorway=pro-light");
    expect(
      moleculeImageUrlForAppearance("/api/molecules/classes/tryptamine?v=1", "pro", "dark", null),
    ).toBe("/api/molecules/classes/tryptamine?v=1&colorway=pro-dark");
  });

  it("adds the requested Pro byte colorway to dynamic image routes", () => {
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd", "pro", "light", null)).toBe(
      "/api/molecules/lsd?colorway=pro-light",
    );
    expect(
      moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "pro", "dark", 0),
    ).toBe("/api/molecules/lsd?v=1&colorway=pro-dark");
  });

  it("does not rewrite unrelated images", () => {
    expect(moleculeImageUrlForAppearance("/images/logo.svg", "fun", "dark", 0)).toBe(
      "/images/logo.svg",
    );
  });
});
