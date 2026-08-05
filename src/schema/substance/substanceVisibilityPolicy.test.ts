import { describe, expect, it } from "vitest";
import {
  isDirectUrlOnlySubstance,
  isHiddenSubstance,
  isPubliclyListedSubstance,
  substanceVisibility,
} from "./substanceVisibilityPolicy";

describe("substanceVisibilityPolicy", () => {
  it("derives hidden from the hidden index category", () => {
    expect(isHiddenSubstance(["hidden"])).toBe(true);
    expect(isHiddenSubstance(["stimulant", "hidden"])).toBe(true);
    expect(isHiddenSubstance([" Hidden "])).toBe(true);
    expect(isHiddenSubstance(["stimulant"])).toBe(false);
    expect(isHiddenSubstance([])).toBe(false);
    expect(isHiddenSubstance(null)).toBe(false);
    expect(isHiddenSubstance(undefined)).toBe(false);
  });

  it("derives direct-URL-only visibility from low and hide-for-now priorities", () => {
    expect(isDirectUrlOnlySubstance("low")).toBe(true);
    expect(isDirectUrlOnlySubstance("hide_for_now")).toBe(true);
    expect(isDirectUrlOnlySubstance("normal")).toBe(false);
    expect(isDirectUrlOnlySubstance("high")).toBe(false);
    expect(isDirectUrlOnlySubstance(null)).toBe(false);
    expect(isDirectUrlOnlySubstance(undefined)).toBe(false);
  });

  it("resolves visibility from raw article inputs with hidden taking precedence", () => {
    expect(substanceVisibility({ indexCategories: ["hidden"], priority: "low" })).toBe("hidden");
    expect(substanceVisibility({ indexCategories: ["stimulant"], priority: "low" })).toBe("low_priority");
    expect(substanceVisibility({ indexCategories: ["stimulant"], priority: "hide_for_now" })).toBe("low_priority");
    expect(substanceVisibility({ indexCategories: ["stimulant"], priority: "normal" })).toBe("public");
    expect(substanceVisibility({})).toBe("public");
  });

  it("lists records publicly only when neither hidden nor direct-URL-only", () => {
    expect(isPubliclyListedSubstance({ isHidden: false, isDirectUrlOnly: false })).toBe(true);
    expect(isPubliclyListedSubstance({ isHidden: true, isDirectUrlOnly: false })).toBe(false);
    expect(isPubliclyListedSubstance({ isHidden: false, isDirectUrlOnly: true })).toBe(false);
    expect(isPubliclyListedSubstance({ isHidden: true, isDirectUrlOnly: true })).toBe(false);
  });
});
