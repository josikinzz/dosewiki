import { describe, expect, it } from "vitest";

import {
  moleculeImageUrlForAppearance,
  moleculeSocialCardUrl,
} from "./moleculeOverrideUrl";

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

describe("moleculeSocialCardUrl", () => {
  it("keys immutable cards on both molecule and renderer revisions", () => {
    expect(moleculeSocialCardUrl("2c-b", "2026-08-25T12:00:00.000Z")).toBe(
      "/api/og/molecule/2c-b?v=2026-08-25T12%3A00%3A00.000Z-2",
    );
  });
});
