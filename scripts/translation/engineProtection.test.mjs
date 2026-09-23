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

test("restoration preserves unexpected digits and accepts harmless token variants", () => {
  const source = "Ambien 1 and experiment 2";
  const protectedValue = protectModelTokens(source);

  assert.equal(
    protectedValue.restore("安必恩 ｛｛ dwprotecta ｝｝ 与实验 {{dwprotectb}} 3"),
    "安必恩 1 与实验 2 3",
  );
});

test("restoration preserves translated serotonin terminology", () => {
  assert.equal(protectModelTokens("serotonin").restore("5-羟色胺"), "5-羟色胺");
});

test("nested placeholders inside Markdown targets and VCode attributes restore exactly", () => {
  for (const source of ["Join [here.]({{discordInvite}})", '[ext-link to="{{discordInvite}}"]Join[/ext-link]']) {
    const protectedValue = protectModelTokens(source);
    assert.equal(protectedValue.restore(protectedValue.source), source);
  }
});
