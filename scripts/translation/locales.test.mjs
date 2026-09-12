import assert from "node:assert/strict";
import test from "node:test";

import { buildBatchPrompt, glossaryTermPattern, resolveLocale } from "./locales.mjs";

test("a glossary term matches whole words, any case, with its punctuation taken literally", () => {
  const entactogen = glossaryTermPattern("Entactogen");
  assert.equal(entactogen.test("MDMA is an entactogen."), true);
  assert.equal(entactogen.test("Classic ENTACTOGEN effects."), true);
  assert.equal(entactogen.test("Entactogenic effects."), false, "a longer word is not the term");
  assert.equal(entactogen.test("nonentactogen"), false);

  const comeUp = glossaryTermPattern("come-up");
  assert.equal(comeUp.test("The come-up lasts an hour."), true);
  assert.equal(comeUp.test("The come up lasts an hour."), false, "the hyphen is part of the term");

  const dot = glossaryTermPattern("come.up");
  assert.equal(dot.test("The come.up now."), true);
  assert.equal(dot.test("The comeXup now."), false, "the dot is not a wildcard");
});

test("a batch prompt injects only the glossary terms its segments mention", () => {
  const locale = resolveLocale("zh-Hans");
  const glossary = { comedown: "退效", tolerance: "耐受性", stimulant: "兴奋剂" };
  const prompt = buildBatchPrompt(
    locale,
    [
      { id: "s0", source: "The comedown is gentle.", contextClass: "prose" },
      { id: "s1", source: "Tolerance builds quickly.", contextClass: "prose" },
    ],
    { glossary },
  );

  assert.match(prompt, /comedown -> 退效/);
  assert.match(prompt, /tolerance -> 耐受性/);
  assert.doesNotMatch(prompt, /stimulant/);

  const bare = buildBatchPrompt(locale, [{ id: "s0", source: "The comedown is gentle.", contextClass: "prose" }]);
  assert.doesNotMatch(bare, /fixed equivalents/, "no glossary, no equivalents block");
});
