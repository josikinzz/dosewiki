import { describe, expect, it } from "vitest";

import { moleculeImageUrlForAppearance } from "./moleculeOverrideUrl";

describe("moleculeImageUrlForAppearance", () => {
  it("leaves non-neutral Fun URLs untouched in either color scheme", () => {
    expect(
      moleculeImageUrlForAppearance(
        "/molecules/classes/tryptamine.svg",
        "fun",
        "light",
        "default",
      ),
    ).toBe("/molecules/classes/tryptamine.svg");
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "fun", "dark", "blue")).toBe(
      "/api/molecules/lsd?v=1",
    );
  });

  it("uses the Pro Dark molecule palette for neutral Fun", () => {
    expect(
      moleculeImageUrlForAppearance(
        "/molecules/classes/tryptamine.svg",
        "fun",
        "light",
        "neutral",
      ),
    ).toBe("/molecules-ei-dark/classes/tryptamine.svg");
    expect(
      moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "fun", "dark", "neutral"),
    ).toBe("/api/molecules/lsd?v=1&colorway=pro-dark");
  });

  it("selects the Pro light and dark static directories", () => {
    expect(
      moleculeImageUrlForAppearance(
        "/molecules/classes/tryptamine.svg",
        "pro",
        "light",
        "default",
      ),
    ).toBe("/molecules-ei/classes/tryptamine.svg");
    expect(
      moleculeImageUrlForAppearance(
        "/molecules-ei/classes/tryptamine.svg",
        "pro",
        "dark",
        "neutral",
      ),
    ).toBe("/molecules-ei-dark/classes/tryptamine.svg");
  });

  it("adds the requested Pro byte colorway to dynamic image routes", () => {
    expect(moleculeImageUrlForAppearance("/api/molecules/lsd", "pro", "light", "default")).toBe(
      "/api/molecules/lsd?colorway=pro-light",
    );
    expect(
      moleculeImageUrlForAppearance("/api/molecules/lsd?v=1", "pro", "dark", "neutral"),
    ).toBe("/api/molecules/lsd?v=1&colorway=pro-dark");
  });

  it("does not rewrite unrelated images", () => {
    expect(moleculeImageUrlForAppearance("/images/logo.svg", "fun", "dark", "neutral")).toBe(
      "/images/logo.svg",
    );
  });
});
