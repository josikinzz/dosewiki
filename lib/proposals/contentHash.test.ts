import { describe, expect, it } from "vitest";
import { contentHash, stableStringify } from "./contentHash";

describe("stableStringify", () => {
  it("rejects non-finite numbers instead of serializing null", () => {
    expect(() => stableStringify({ n: Number.NaN })).toThrow(/non-finite/);
  });
});

describe("contentHash", () => {
  it("is deterministic and independent of key order or undefined fields", () => {
    const left = { slug: "lsd", title: "LSD", summary: { content: "a", note: undefined } };
    const right = { summary: { content: "a" }, title: "LSD", slug: "lsd" };
    expect(contentHash(left)).toBe(contentHash(right));
    expect(contentHash(left)).toBe(contentHash(left));
  });

  it("changes when any nested value changes", () => {
    expect(contentHash({ a: { b: 1 } })).not.toBe(contentHash({ a: { b: 2 } }));
  });
});
