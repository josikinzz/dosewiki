import assert from "node:assert/strict";
import test from "node:test";

import { buildBatchPrompt, resolveLocale } from "./locales.mjs";
import { STYLE_EXAMPLE_CHAR_CAP, STYLE_EXAMPLE_LIMIT, selectStyleExamples, styleExampleTerms } from "./style-guide.mjs";

const locale = resolveLocale("zh-Hans");
const BENZYL = "2-Benzylpiperidine is a stimulant of the phenidate family.";

const example = (id, source, addedAt, size = 10) => ({
  id,
  source,
  before: "旧".repeat(size),
  after: "新".repeat(size),
  why: "Fluency",
  addedAt,
});

test("approved rules and the chosen examples appear in the prompt; nothing appears without a guide", () => {
  const styleGuide = {
    rules: ["用“服用”而不是“摄入”描述剂量。", "Avoid the passive 被 construction."],
    examples: [{ id: "a", source: "Replications recreate the visual effects.", before: "返回复现", after: "复现作品", why: "Fluency: the gallery label reads as a noun", addedAt: 1 }],
    revision: "r1",
  };
  const prompt = buildBatchPrompt(locale, [{ id: "s0", source: "A replicating pattern.", contextClass: "prose" }], { styleGuide });
  assert.match(prompt, /Style rules for .*:\n- 用“服用”而不是“摄入”描述剂量。\n- Avoid the passive 被 construction\./);
  assert.match(prompt, /English: Replications recreate the visual effects\.\nBefore: 返回复现\nAfter: 复现作品\nWhy: Fluency: the gallery label reads as a noun/);

  const bare = buildBatchPrompt(locale, [{ id: "s0", source: "A replicating pattern.", contextClass: "prose" }]);
  assert.doesNotMatch(bare, /Style rules|Reviewers corrected/);
  const empty = buildBatchPrompt(locale, [{ id: "s0", source: "A replicating pattern.", contextClass: "prose" }], { styleGuide: { rules: [], examples: [], revision: "" } });
  assert.equal(empty, bare);
});

test("overlap is measured on content words of the example's English, inflections included", () => {
  assert.deepEqual(styleExampleTerms("The stimulant is from the phenidate family."), ["stimulant", "phenidate", "family"]);
  const [first] = selectStyleExamples(
    [example("recent", "Colour shifts are common.", 9), example("phenidates", "Phenidates are stimulants.", 1)],
    BENZYL,
  );
  assert.equal(first.id, "phenidates", "overlap outranks recency");
});

test("example selection is deterministic: overlap, then recency, then id, whatever the stored order", () => {
  const examples = [
    example("b", "Unrelated wording about colour.", 5),
    example("a", "Unrelated wording about colour.", 5),
    example("old-match", "A stimulant with a long history.", 1),
    example("new-match", "A stimulant with a long history.", 2),
    example("best", "The phenidate family includes this stimulant.", 0),
    example("newest", "Nothing in common here.", 10),
    example("second-newest", "Nothing in common here.", 9),
  ];
  const expected = ["best", "new-match", "old-match", "newest", "second-newest"];
  assert.deepEqual(selectStyleExamples(examples, BENZYL).map((e) => e.id), expected);
  assert.deepEqual(selectStyleExamples([...examples].reverse(), BENZYL).map((e) => e.id), expected);
  assert.equal(expected.length, STYLE_EXAMPLE_LIMIT);
});

test("example selection respects the character cap, skipping an example that does not fit", () => {
  const big = Math.ceil(STYLE_EXAMPLE_CHAR_CAP / 2);
  const examples = [
    example("huge", "stimulant", 3, STYLE_EXAMPLE_CHAR_CAP),
    example("half-1", "stimulant", 2, big / 2),
    example("half-2", "stimulant", 1, big / 2),
    example("small", "Nothing shared.", 0),
  ];
  const chosen = selectStyleExamples(examples, BENZYL);
  assert.deepEqual(chosen.map((e) => e.id), ["half-1", "small"]);
  const printed = chosen.reduce((sum, e) => sum + e.source.length + e.before.length + e.after.length + e.why.length, 0);
  assert.ok(printed <= STYLE_EXAMPLE_CHAR_CAP);

  const prompt = buildBatchPrompt(locale, [{ id: "s0", source: BENZYL, contextClass: "prose" }], { styleGuide: { rules: [], examples, revision: "r" } });
  assert.doesNotMatch(prompt, new RegExp("旧".repeat(STYLE_EXAMPLE_CHAR_CAP)));
});
