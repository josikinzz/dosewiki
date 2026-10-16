import assert from "node:assert/strict";
import test from "node:test";

import { protectModelTokens } from "./engine.mjs";

test("model protection restores numbers, citations, links, placeholders, and inline tags", () => {
  const source = "Article 84 keeps 25I-NBOMe at 2.5 mg [cite:law-2026-84] with [b]care[/b], [guide](https://example.test/v2), and {{count_2}}.";
  const protectedValue = protectModelTokens(source);

  assert.doesNotMatch(protectedValue.source, /\d/);
  assert.doesNotMatch(protectedValue.source, /\[cite:/);
  assert.doesNotMatch(protectedValue.source, /https:\/\//);
  assert.doesNotMatch(protectedValue.source, /\[\/?b\]/);
  assert.equal(protectedValue.restore(protectedValue.source), source);
});

test("restoration preserves unexpected digits and accepts harmless token variants", () => {
  const source = "Ambien 1 and experiment 2";
  const protectedValue = protectModelTokens(source);

  assert.equal(
    protectedValue.restore("安必恩 ｛｛ dwprotecta ｝｝ 与实验 {{dwprotectb}} 3"),
    "安必恩 1 与实验 2 3",
  );
});
