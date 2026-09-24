import { describe, expect, it } from "vitest";
import {
  MAX_TRANSLATION_CREDITS_PER_LOCALE,
  TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH,
  parseTranslationCredits,
  projectTranslationCredits,
  translationCreditHref,
  translationCreditsFor,
} from "./translationCredits";

const VACUE = { profileKey: "vacue", contribution: "  Chinese localization,\n terminology review  " };

describe("parseTranslationCredits", () => {
  it("normalizes keys to profile-key case, trims and collapses the contribution, and orders locales", () => {
    expect(parseTranslationCredits({ ru: [{ profileKey: "ivan", contribution: "Review" }], "zh-Hans": [VACUE] })).toEqual({
      "zh-Hans": [{ profileKey: "VACUE", contribution: "Chinese localization, terminology review" }],
      ru: [{ profileKey: "IVAN", contribution: "Review" }],
    });
  });

  it("drops locales whose list is empty", () => {
    expect(parseTranslationCredits({ "zh-Hans": [], ru: [] })).toEqual({});
  });

  it.each([
    ["an array", []],
    ["a string", "zh-Hans"],
    ["null", null],
  ])("refuses %s as the whole value", (_label, raw) => {
    expect(() => parseTranslationCredits(raw)).toThrow(/must be an object/);
  });

  it("refuses an unknown locale", () => {
    expect(() => parseTranslationCredits({ xx: [VACUE] })).toThrow(/not a translation language/);
  });

  it("refuses a locale list that is not an array or runs too long", () => {
    expect(() => parseTranslationCredits({ ru: VACUE })).toThrow(/must be a list/);
    const many = Array.from({ length: MAX_TRANSLATION_CREDITS_PER_LOCALE + 1 }, (_, index) => ({
      profileKey: `P${index}`,
      contribution: "Review",
    }));
    expect(() => parseTranslationCredits({ ru: many })).toThrow(/at most/);
  });

  it.each([
    ["a non-object entry", "VACUE"],
    ["a missing key", { contribution: "Review" }],
    ["a key outside the profile grammar", { profileKey: "va cue", contribution: "Review" }],
    ["an empty contribution", { profileKey: "VACUE", contribution: "   " }],
    ["a non-string contribution", { profileKey: "VACUE", contribution: 4 }],
    ["an overlong contribution", { profileKey: "VACUE", contribution: "x".repeat(TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH + 1) }],
  ])("refuses %s", (_label, entry) => {
    expect(() => parseTranslationCredits({ "zh-Hans": [entry] })).toThrow();
  });

  it("refuses the same profile twice in one locale", () => {
    expect(() =>
      parseTranslationCredits({ "zh-Hans": [VACUE, { profileKey: "VACUE", contribution: "Again" }] }),
    ).toThrow(/more than once/);
  });
});

describe("translationCreditsFor", () => {
  it("reads one locale from a stored value and skips anything malformed", () => {
    const stored = {
      "zh-Hans": [{ profileKey: "VACUE", contribution: "Chinese localization" }, { profileKey: 3 }, null],
      ru: "nonsense",
    };
    expect(translationCreditsFor(stored, "zh-Hans")).toEqual([{ profileKey: "VACUE", contribution: "Chinese localization" }]);
    expect(translationCreditsFor(stored, "ru")).toEqual([]);
    expect(translationCreditsFor(undefined, "zh-Hans")).toEqual([]);
    expect(translationCreditsFor(null, "zh-Hans")).toEqual([]);
  });
});

describe("translationCreditHref", () => {
  it("prefers the first external link and falls back to the contributor App Path", () => {
    expect(translationCreditHref({ key: "VACUE", links: [{ label: "X", url: "https://x.com/Vacue138950" }] })).toBe(
      "https://x.com/Vacue138950",
    );
    expect(translationCreditHref({ key: "VACUE", links: [{ label: "bad", url: "javascript:alert(1)" }] })).toBe(
      "/contributors/vacue",
    );
    expect(translationCreditHref({ key: "VACUE", links: [] })).toBe("/contributors/vacue");
  });
});

describe("projectTranslationCredits", () => {
  it("keeps only public profile fields, in credit order, and drops credits whose profile is gone", () => {
    const profiles = new Map([
      ["VACUE", {
        key: "VACUE",
        displayName: "Vacue",
        avatarUrl: "https://media.example/vacue.png",
        links: [{ label: "X", url: "https://x.com/Vacue138950" }],
        bio: "private-ish bio",
        membershipEmail: "vacue@example.com",
      }],
    ]);
    const projected = projectTranslationCredits(
      [{ profileKey: "GONE", contribution: "Old" }, { profileKey: "VACUE", contribution: "Chinese localization" }],
      (key) => profiles.get(key) ?? null,
    );
    expect(projected).toEqual([{
      key: "VACUE",
      displayName: "Vacue",
      avatarUrl: "https://media.example/vacue.png",
      href: "https://x.com/Vacue138950",
      contribution: "Chinese localization",
    }]);
  });
});
