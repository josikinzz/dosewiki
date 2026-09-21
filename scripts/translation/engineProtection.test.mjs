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

test("each repeated protected value receives an independent token", () => {
  const source = "[b]10 minutes[/b], then [b]10 minutes[/b] [cite:x-10] [cite:x-10]";
  const protectedValue = protectModelTokens(source);
  const tokens = protectedValue.source.match(/\{\{DWPROTECT[A-Z]+\}\}/g) ?? [];

  assert.equal(tokens.length, 8);
  assert.equal(new Set(tokens).size, 8);
  assert.equal(protectedValue.restore(protectedValue.source), source);
});
