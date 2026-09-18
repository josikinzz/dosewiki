import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentHash, stableStringify } from "./contentHash";

describe("stableStringify", () => {
  it("sorts keys at every depth and drops undefined object values", () => {
    expect(
      stableStringify({ b: 1, a: { z: undefined, y: [1, undefined, { d: true, c: "x" }] } }),
    ).toBe('{"a":{"y":[1,null,{"c":"x","d":true}]},"b":1}');
  });

  it("rejects non-finite numbers instead of serializing null", () => {
    expect(() => stableStringify({ n: Number.NaN })).toThrow(/non-finite/);
  });
});

describe("contentHash", () => {
  it("is a sha256 hex digest of the canonical text", () => {
    const value = { title: "LSD", slug: "lsd", dosage: { unit: "ug" } };
    const expected = createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
    expect(contentHash(value)).toBe(expected);
    expect(contentHash(value)).toMatch(/^[0-9a-f]{64}$/);
  });

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
