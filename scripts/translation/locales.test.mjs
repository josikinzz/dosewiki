import assert from "node:assert/strict";
import test from "node:test";

import { GLOSS_CAP, buildBatchPrompt, glossaryTermPattern, kindInContext, resolveLocale } from "./locales.mjs";

test("a glossary term matches whole words, any case, with its punctuation taken literally", () => {
  const entactogen = glossaryTermPattern("Entactogen");
  assert.equal(entactogen.test("MDMA is an entactogen."), true);
  assert.equal(entactogen.test("Classic ENTACTOGEN effects."), true);
  assert.equal(entactogen.test("Entactogenic effects."), false, "a longer word is not the term");
  assert.equal(entactogen.test("Two entactogens."), true, "a plural is the term");
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

  assert.match(prompt, /\[s0\]\ncomedown -> 退效/);
  assert.match(prompt, /\[s1\]\ntolerance -> 耐受性/);
  assert.doesNotMatch(prompt, /stimulant/);

  const bare = buildBatchPrompt(locale, [{ id: "s0", source: "The comedown is gentle.", contextClass: "prose" }]);
  assert.doesNotMatch(bare, /fixed equivalents/, "no glossary, no equivalents block");
});

test("each unit carries only the glossary terms it mentions, inflected forms included", () => {
  const locale = resolveLocale("zh-Hans");
  const glossary = { Phenidate: "Phenidate", Replication: "体验再现", Light: "轻度" };
  const prompt = buildBatchPrompt(
    locale,
    [
      { id: "s0", source: "It is structurally related to the phenidates.", contextClass: "prose" },
      { id: "s1", source: "2-Benzylpiperidine is a stimulant drug of the piperidine class.", contextClass: "prose" },
      { id: "s2", source: "Some users feel lightheaded while replicating the visuals.", contextClass: "prose" },
    ],
    { glossary },
  );
  const equivalents = prompt.slice(prompt.indexOf("Use these fixed equivalents"));

  assert.equal(
    equivalents,
    "Use these fixed equivalents, each only in the segment it is listed under:\n[s0]\nPhenidate -> Phenidate\n[s2]\nReplication -> 体验再现",
    "the unrelated sentence gets no list, and Light does not match inside lightheaded",
  );
});

test("a batch prompt prints a gloss beside an injected term, and only there", () => {
  const locale = resolveLocale("zh-Hans");
  const glossary = { comedown: "退效", tolerance: "耐受性", stimulant: "兴奋剂" };
  const glosses = {
    comedown: "Declining phase as effects fade · not withdrawal",
    stimulant: "Drug class that raises arousal · not an energy drink",
  };
  const prompt = buildBatchPrompt(
    locale,
    [
      { id: "s0", source: "The comedown is gentle.", contextClass: "prose" },
      { id: "s1", source: "Tolerance builds quickly.", contextClass: "prose" },
    ],
    { glossary, glosses },
  );

  const equivalents = prompt.slice(prompt.indexOf("Use these fixed equivalents"));
  assert.equal(
    equivalents,
    "Use these fixed equivalents, each only in the segment it is listed under:\n[s0]\ncomedown -> 退效  (Declining phase as effects fade · not withdrawal)\n[s1]\ntolerance -> 耐受性",
    "a glossed term carries its gloss in parentheses after two spaces; an unglossed term reads exactly as before",
  );
  assert.doesNotMatch(prompt, /stimulant|energy drink/, "a gloss for a term no segment mentions is not injected");

  const repeated = buildBatchPrompt(
    locale,
    [
      { id: "s0", source: "The comedown is gentle.", contextClass: "prose" },
      { id: "s1", source: "Comedowns vary.", contextClass: "prose" },
    ],
    { glossary, glosses },
  );
  assert.equal(repeated.match(/not withdrawal/g).length, 1, "a gloss prints once per batch, at the first unit that mentions the term");
  assert.match(repeated, /\[s1\]\ncomedown -> 退效$/);

  const withoutGlosses = buildBatchPrompt(locale, [{ id: "s0", source: "The comedown is gentle.", contextClass: "prose" }], { glossary });
  assert.match(withoutGlosses, /\ncomedown -> 退效$/, "no glosses at all leaves the line unchanged");
});

test("surface-specific kinds are injected only into batches from their surface", () => {
  const locale = resolveLocale("zh-Hans");
  const glossary = { Offset: "消退期", Oral: "口服", Frequent: "常见", Dosage: "剂量", Replicator: "复现者", Euphoria: "欣快" };
  const kinds = { Offset: "enum:duration", Oral: "route", Frequent: "frequency", Dosage: "section-heading", Replicator: "replication", Euphoria: "effect-name" };
  const source = "Offset was oral and frequent; see Dosage. The replicator felt euphoria.";
  const equivalentsFor = (contextKind) => {
    const prompt = buildBatchPrompt(locale, [{ id: "s0", source, contextClass: "prose", contextKind }], { glossary, kinds });
    return prompt.slice(prompt.indexOf("Use these fixed equivalents"));
  };

  const report = equivalentsFor("report");
  assert.match(report, /Euphoria -> 欣快/, "an effect name is mention-based everywhere");
  assert.doesNotMatch(report, /Offset|Oral|Frequent|Dosage|Replicator/, "article vocabulary and replication vocabulary stay out of a trip report");

  const article = equivalentsFor("article");
  for (const term of ["Offset", "Oral", "Frequent", "Dosage", "Euphoria"]) assert.match(article, new RegExp(`${term} -> `), `${term} belongs in a substance article`);
  assert.doesNotMatch(article, /Replicator/, "replication vocabulary stays out of an article");

  const effect = equivalentsFor("effect");
  assert.match(effect, /Offset -> 消退期/, "an effect article shares the article vocabulary");

  const replication = equivalentsFor("replication");
  assert.match(replication, /Replicator -> 复现者/);
  assert.doesNotMatch(replication, /Offset|Oral/);

  const unstamped = equivalentsFor(undefined);
  for (const term of Object.keys(glossary)) assert.match(unstamped, new RegExp(`${term} -> `), `${term}: an unstamped batch is not filtered`);

  const mixed = buildBatchPrompt(
    locale,
    [
      { id: "s0", source: "The comedown.", contextClass: "prose", contextKind: "report" },
      { id: "s1", source, contextClass: "prose", contextKind: "article" },
    ],
    { glossary, kinds },
  );
  assert.match(mixed, /\[s1\]\n(?:.+\n)*Offset -> 消退期/, "the article unit carries the article vocabulary");

  const reportBesideArticle = buildBatchPrompt(
    locale,
    [
      { id: "s0", source: "Offset came late.", contextClass: "prose", contextKind: "report" },
      { id: "s1", source: "The comedown.", contextClass: "prose", contextKind: "article" },
    ],
    { glossary, kinds },
  );
  assert.doesNotMatch(reportBesideArticle, /Offset -> /, "an article unit in the batch no longer admits article vocabulary into a trip report");

  assert.equal(kindInContext("enum:legal", new Set(["library"])), false);
  assert.equal(kindInContext("chemical-class", new Set(["library"])), true, "an unlisted kind is mention-based");
  assert.equal(kindInContext("", new Set(["report"])), true, "a term without a kind is mention-based");
});

test("at most GLOSS_CAP terms carry a gloss, the longest terms first; the rest print the rendering alone", () => {
  const locale = resolveLocale("zh-Hans");
  assert.equal(GLOSS_CAP, 40);
  const glossary = {};
  const glosses = {};
  const words = [];
  for (let i = 0; i < GLOSS_CAP + 5; i += 1) {
    const term = `term${String(i).padStart(2, "0")}`;
    glossary[term] = `译${i}`;
    glosses[term] = `gloss ${i}`;
    words.push(term);
  }
  glossary["a much longer phrase"] = "长语";
  glosses["a much longer phrase"] = "the phrase";
  glossary["ungl"] = "无";
  const source = `${words.join(" ")} a much longer phrase ungl`;
  const prompt = buildBatchPrompt(locale, [{ id: "s0", source, contextClass: "prose" }], { glossary, glosses });
  const lines = prompt.slice(prompt.indexOf("Use these fixed equivalents")).split("\n").slice(2);

  assert.equal(lines.length, GLOSS_CAP + 7, "every mentioned term is still injected");
  assert.equal(lines.filter((line) => / {2}\(.+\)$/.test(line)).length, GLOSS_CAP);
  assert.ok(lines.includes("a much longer phrase -> 长语  (the phrase)"), "the longest term keeps its gloss");
  assert.ok(lines.includes("ungl -> 无"), "a term without a gloss never counts against the cap");
  const dropped = lines.filter((line) => /^term\d\d -> 译\d+$/.test(line));
  assert.equal(dropped.length, 6, "the shortest glossed terms lose their gloss, rendering intact");
  assert.deepEqual(dropped.map((line) => line.slice(0, 6)), ["term39", "term40", "term41", "term42", "term43", "term44"], "equal length breaks ties by term order, so the last ones lose");
});
