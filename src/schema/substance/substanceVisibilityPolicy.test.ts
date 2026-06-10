import { describe, expect, it } from "vitest";
import {
  isHiddenSubstance,
  isLowPrioritySubstance,
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

  it("derives low priority from the low priority value, defaulting missing priority to normal", () => {
    expect(isLowPrioritySubstance("low")).toBe(true);
    expect(isLowPrioritySubstance("normal")).toBe(false);
    expect(isLowPrioritySubstance("high")).toBe(false);
    expect(isLowPrioritySubstance(null)).toBe(false);
    expect(isLowPrioritySubstance(undefined)).toBe(false);
  });

  it("resolves visibility from raw article inputs with hidden taking precedence", () => {
    expect(substanceVisibility({ indexCategories: ["hidden"], priority: "low" })).toBe("hidden");
    expect(substanceVisibility({ indexCategories: ["stimulant"], priority: "low" })).toBe("low_priority");
    expect(substanceVisibility({ indexCategories: ["stimulant"], priority: "normal" })).toBe("public");
    expect(substanceVisibility({})).toBe("public");
  });

  it("lists records publicly only when neither hidden nor low priority", () => {
    expect(isPubliclyListedSubstance({ isHidden: false, isLowPriority: false })).toBe(true);
    expect(isPubliclyListedSubstance({ isHidden: true, isLowPriority: false })).toBe(false);
    expect(isPubliclyListedSubstance({ isHidden: false, isLowPriority: true })).toBe(false);
    expect(isPubliclyListedSubstance({ isHidden: true, isLowPriority: true })).toBe(false);
  });
});
