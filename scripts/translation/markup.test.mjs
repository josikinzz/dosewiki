import assert from "node:assert/strict";
import test from "node:test";

import { scanVCode, spliceVCode, markupTokens, stripMarkup, INLINE_TAGS } from "./markup.mjs";
import { treeSignature, reconcileBody } from "./reconcile.mjs";
import { validateSegment } from "./validate.mjs";
import { parseRawVCodeContent } from "../../src/features/effects/vcode/normalize.ts";

const identity = () => null;

test("a paragraph is one segment, with its inline markup attached", () => {
  const raw = "[p]An [b]abnormal heartbeat[/b] is a condition.[/p]";
  const spans = scanVCode(raw);

  assert.equal(spans.length, 1);
  assert.equal(spans[0].text, "An [b]abnormal heartbeat[/b] is a condition.");
});

test("block tags cut segments, so two paragraphs never merge", () => {
  const raw = "[p]First sentence.[/p]\n\n[p]Second sentence.[/p]";
  const texts = scanVCode(raw).map((span) => span.text);

  assert.deepEqual(texts, ["First sentence.", "Second sentence."]);
});

test("link targets, colours, icons and citation keys are never segments", () => {
  const raw =
    '[headered-textbox label="Level 1" header="Subtle" labelBackground="#AAAAAA"][p]Reach [int-link to="/effectsgeometry"]geometry[/int-link].[/p][ref to="3" no="1" /][/headered-textbox]';
  const texts = scanVCode(raw).map((span) => span.text);

  assert.deepEqual(
    [...texts].sort(),
    ["Level 1", 'Reach [int-link to="/effectsgeometry"]geometry[/int-link].', "Subtle", '[ref to="3" no="1" /]'].sort(),
  );
  assert.equal(
    texts.some((text) => text === "#AAAAAA" || text === "/effectsgeometry" || text === "3"),
    false,
  );
});

test("a span that is only markup carries no prose to translate", () => {
  assert.equal(stripMarkup('[ref to="3" no="1" /]').trim(), "");
  assert.equal(stripMarkup("An [b]x[/b] y").replace(/\s+/g, " "), "An x y");
});

test("a bracket that is not a tag stays inside its sentence", () => {
  const raw = "[p]As [Alan Watts] put it, the point is the point.[/p]";
  const spans = scanVCode(raw);

  assert.equal(spans.length, 1);
  assert.ok(spans[0].text.includes("[Alan Watts]"));
});

test("hash-dialect directives keep their header and expose their prose", () => {
  const raw = '##quotation|author="Josie Kins"|profile="Josie"{Now to wrap this up, a few points.}';
  const texts = scanVCode(raw).map((span) => span.text);

  assert.deepEqual(texts, ["Now to wrap this up, a few points."]);
  assert.equal(texts.includes("Josie Kins"), false, "an attribution is identity, not prose");
});

test("splicing without translations reproduces the source byte for byte", () => {
  const raw =
    '[p]One.[/p]\n\n[headered-textbox label="Level 2" header="Mild"][p]Two [b]bold[/b].[/p][/headered-textbox]\n[hr /]\n##md|text="Three"{}';
  const spans = scanVCode(raw);

  assert.equal(spliceVCode(raw, spans, identity), raw);
});

test("splicing replaces only the spans it was given", () => {
  const raw = "[p]Hello.[/p]\n\n[p]World.[/p]";
  const spans = scanVCode(raw);
  const out = spliceVCode(raw, spans, (span) => (span.text === "Hello." ? "你好。" : null));

  assert.equal(out, "[p]你好。[/p]\n\n[p]World.[/p]");
});

test("whitespace around a segment survives, so blocks keep their spacing", () => {
  const raw = "[p]\n  Padded.\n[/p]";
  const spans = scanVCode(raw);

  assert.equal(spans[0].text, "Padded.");
  assert.equal(spliceVCode(raw, spans, () => "填充。"), "[p]\n  填充。\n[/p]");
});

test("markup tokens compare as a set, so word order may move but a tag may not vanish", () => {
  assert.deepEqual(markupTokens("a [b]x[/b] c"), markupTokens("[b]x[/b] a c"));
  assert.notDeepEqual(markupTokens("a [b]x[/b]"), markupTokens("a x"));
  assert.notDeepEqual(
    markupTokens('[int-link to="/a"]x[/int-link]'),
    markupTokens('[int-link to="/b"]x[/int-link]'),
    "a rewritten link target is a lost target",
  );
});

test("inline tags are the ones that live inside a sentence", () => {
  assert.equal(INLINE_TAGS.has("b"), true);
  assert.equal(INLINE_TAGS.has("int-link"), true);
  assert.equal(INLINE_TAGS.has("p"), false);
  assert.equal(INLINE_TAGS.has("headered-textbox"), false);
});

test("a tree signature ignores prose and holds everything else", () => {
  const before = parseRawVCodeContent('[p]English text with [b]emphasis[/b].[/p]');
  const after = parseRawVCodeContent('[p]中文文本带[b]强调[/b]。[/p]');

  assert.deepEqual(treeSignature(before), treeSignature(after));
});

test("a translation that moves a link target fails reconciliation", () => {
  const sourceRaw = '[p]See [int-link to="/effects/geometry"]geometry[/int-link].[/p]';
  const targetRaw = '[p]参见[int-link to="/effects/几何"]几何结构[/int-link]。[/p]';

  const verdict = reconcileBody({ sourceRaw, targetRaw, parse: parseRawVCodeContent });

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.defects, ["markup_mismatch"]);
});

test("a translation that drops a block fails on node count", () => {
  const sourceRaw = "[p]One.[/p]\n\n[p]Two.[/p]";
  const targetRaw = "[p]一。[/p]";

  const verdict = reconcileBody({ sourceRaw, targetRaw, parse: parseRawVCodeContent });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.details.nodeCount.source > verdict.details.nodeCount.target);
});

test("an intensity scale keeps every level, and losing one is caught", () => {
  const level = (n, name) => `[headered-textbox label="Level ${n}" header="${name}"][p]Prose.[/p][/headered-textbox]`;
  const sourceRaw = [level(1, "Subtle"), level(2, "Mild"), level(3, "Moderate")].join("\n[hr /]\n");

  const spans = scanVCode(sourceRaw);
  const translated = spliceVCode(sourceRaw, spans, (span) => `${span.text}(zh)`);
  assert.equal(reconcileBody({ sourceRaw, targetRaw: translated, parse: parseRawVCodeContent }).ok, true);

  const dropped = [level(1, "Subtle"), level(2, "Mild")].join("\n[hr /]\n");
  assert.equal(reconcileBody({ sourceRaw, targetRaw: dropped, parse: parseRawVCodeContent }).ok, false);
});

test("reconciliation reports an unparsable source as a source defect", () => {
  const verdict = reconcileBody({
    sourceRaw: "anything",
    targetRaw: "anything",
    parse: () => {
      throw new Error("nesting too deep");
    },
  });

  assert.equal(verdict.ok, false);
  assert.match(verdict.details.unparsableSource, /nesting too deep/);
});

const markupLocale = (await import("./locales.mjs")).resolveLocale("zh-Hans");

test("a Markdown link label is prose, and its target is not", () => {
  const locale = markupLocale;

  const translatedLabel = validateSegment({
    source: "Licensed [CC0](/docs/license) for reuse.",
    target: "以 [CC0](/docs/license) 许可发布，可自由使用。",
    locale,
  });
  assert.equal(translatedLabel.defects.includes("MARKUP_LOSS"), false, "a Markdown label is not a VCode tag");

  const movedTarget = validateSegment({
    source: "Licensed [CC0](/docs/license) for reuse.",
    target: "以 [CC0](/文档/许可) 许可发布，可自由使用。",
    locale,
  });
  assert.equal(movedTarget.defects.includes("MARKUP_LOSS"), true, "a translated route is a broken route");
});

test("the VCode markup gate only runs on markup segments", () => {
  const locale = markupLocale;
  const input = { source: "An [b]emphasis[/b] here.", target: "此处有强调。" };

  assert.equal(validateSegment({ ...input, locale }).defects.includes("MARKUP_LOSS"), false);
  assert.equal(validateSegment({ ...input, locale, markup: true }).defects.includes("MARKUP_LOSS"), true);
});

test("a VCode frequency label is not read as a Markdown link", () => {
  const locale = markupLocale;

  const verdict = validateSegment({
    source: '[b][int-link to="/effectsdizziness"]Dizziness[/int-link][/b] [sup](frequent)[/sup]',
    target: '[b][int-link to="/effectsdizziness"]头晕[/int-link][/b] [sup](频繁)[/sup]',
    locale,
    markup: true,
  });

  assert.deepEqual(verdict.defects, [], "the frequency label is prose the glossary pins");
});
