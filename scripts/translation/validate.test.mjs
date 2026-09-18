import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocale } from "./locales.mjs";
import {
  DEFECT_CODES,
  compareNumbers,
  extractCiteMarkers,
  extractNumbers,
  isBlocking,
  looksTranslatable,
  parseModelJson,
  validateSegment,
} from "./validate.mjs";

const zh = resolveLocale("zh-Hans");
const nl = resolveLocale("nl");

function defectsFor(source, target, locale = zh) {
  return validateSegment({ source, target, locale }).defects;
}

test("a changed dose is a blocking number mismatch", () => {
  const defects = defectsFor("A strong dose is 20 mg taken orally.", "强剂量为 200 mg 口服。");

  assert.ok(defects.includes(DEFECT_CODES.NUMBER_MISMATCH));
  assert.equal(isBlocking(defects), true);
});

test("a faithful translation of a dose passes every gate", () => {
  assert.deepEqual(defectsFor("A strong dose is 20-30 mg taken orally.", "强剂量为 20-30 mg 口服。"), []);
});

test("receptor names do not count as measurements", () => {
  assert.deepEqual(extractNumbers("Binding at 5-HT2A and 5-HT2C receptors"), []);
  assert.deepEqual(extractNumbers("Doses of 330-650 mg"), ["330", "650"]);
});

test("the Chinese rendering of serotonin does not read as an added dose", () => {
  const defects = defectsFor(
    "2C-B binds serotonin 5-HT2A receptors.",
    "2C-B 与 5-羟色胺 5-HT2A 受体结合。",
  );

  assert.deepEqual(defects, []);
});

test("a small integer translated as a Chinese numeral has survived", () => {
  const { dropped } = compareNumbers("Narcotics in Category 1", "第一类麻醉品");

  assert.deepEqual(dropped, []);
});

test("Chinese myriad scales are a faithful rendering, not a lost number", () => {
  // 亿 is 10^8 and 万 is 10^4, so the digits legitimately change.
  assert.deepEqual(
    compareNumbers("revenue of $2 to $3 billion", "收入为20亿至30亿美元").dropped,
    [],
  );
  assert.deepEqual(compareNumbers("about 2.5 million rial", "约250万里亚尔").dropped, []);
  assert.deepEqual(compareNumbers("some 8,000 hectares", "约8,000公顷").dropped, []);
});

test("a scale word does not excuse a wrong quantity", () => {
  assert.deepEqual(compareNumbers("revenue of $3 billion", "收入为20亿美元").dropped, ["3"]);
});

test("a fabricated number is reported without blocking the run", () => {
  const defects = defectsFor("Doses vary between users.", "剂量因人而异，通常为 500 mg。");

  assert.ok(defects.includes(DEFECT_CODES.NUMBER_ADDED));
  assert.equal(isBlocking(defects), false);
});

test("a Traditional character fails under zh-Hans and passes where the gate is off", () => {
  const traditional = "劑量很小且溫和。";

  assert.ok(defectsFor("The dose is small and gentle.", traditional).includes(DEFECT_CODES.SCRIPT_LEAK));
  assert.equal(
    defectsFor("The dose is small and gentle.", "De dosis is klein en mild.", nl).includes(DEFECT_CODES.SCRIPT_LEAK),
    false,
  );
});

test("a Traditional character quoted from the source is not drift", () => {
  const source = "指定薬物及び医療等の用途を定める省令, current designated-drug ordinance";
  const target = "指定薬物及び医療等の用途を定める省令（现行指定药物省令）";

  assert.equal(defectsFor(source, target).includes(DEFECT_CODES.SCRIPT_LEAK), false);
  // The same character with no source warrant is still a leak.
  assert.ok(defectsFor("Treatment is available.", "可以获得治療。").includes(DEFECT_CODES.SCRIPT_LEAK));
});

test("ring locants and fold-multipliers survive the number gate", () => {
  assert.deepEqual(
    compareNumbers("1,4- and 1,5-benzodiazepines are covered", "1,4-和1,5-苯二氮䓬类均被涵盖").dropped,
    [],
  );
  assert.deepEqual(
    compareNumbers("an 11.7-fold binding preference", "结合偏好为 11.7 倍").dropped,
    [],
  );
});

test("clock times, dotted dates, and idiomatic Chinese numbers survive the number gate", () => {
  // The minutes of a timestamp before Han text are not a name-borne locant.
  assert.deepEqual(compareNumbers("14:00 - After a while I wrote this.", "14:00 - 过了一会儿我写下了这些。").dropped, []);
  assert.deepEqual(compareNumbers("I am not 100% certain.", "我不能百分之百确定。").dropped, []);
  assert.deepEqual(compareNumbers("about 100 people", "大约一百人").dropped, []);
  assert.deepEqual(compareNumbers("about 100 people", "大约很多人").dropped, ["100"]);
  // Statute dates lose their zero padding and their dots in Chinese.
  assert.deepEqual(compareNumbers("Resolution No. 681 of 30.06.1998", "1998年6月30日第681号决议").dropped, []);
  assert.deepEqual(compareNumbers("dated 06 July 2026", "日期为2026年7月6日").dropped, []);
  // A round myriad reads as 一万 with no scale word in the source.
  assert.deepEqual(compareNumbers("The 10,000 things", "一万种事物").dropped, []);
  assert.deepEqual(compareNumbers("The 10,000 things", "万物").dropped, ["10000"]);
});

test("names, statute citations, and lone chemical names are not prose", () => {
  assert.equal(looksTranslatable("Anton Köllisch"), false);
  assert.equal(looksTranslatable("58 nM (norquetiapine)"), false);
  assert.equal(looksTranslatable("A.R.S. §§ 13-3401(6)(c)(xliii)"), false);
  assert.equal(looksTranslatable("Tolerance returns to baseline after a week."), true);
  assert.equal(looksTranslatable("Extrapolations from rat cortical cultures"), true);
});

test("characters shared by both scripts are not a script leak", () => {
  // 鼠 is identical in Simplified and Traditional; a hand-written gate flags it.
  assert.deepEqual(defectsFor("Rat cortical cultures were used.", "使用了大鼠皮层培养物。"), []);
});

test("empty, whitespace-only, and non-string targets each report their own code", () => {
  assert.deepEqual(defectsFor("Some prose here.", ""), [DEFECT_CODES.EMPTY_OUTPUT]);
  assert.deepEqual(defectsFor("Some prose here.", "   "), [DEFECT_CODES.EMPTY_OUTPUT]);
  assert.deepEqual(defectsFor("Some prose here.", null), [DEFECT_CODES.UNPARSABLE_OUTPUT]);
});

test("prose returned in English is untranslated, but a name echoed back is not", () => {
  assert.ok(
    defectsFor("Tolerance returns to baseline after a week.", "Tolerance returns to baseline after a week.").includes(
      DEFECT_CODES.UNTRANSLATED,
    ),
  );
  assert.deepEqual(defectsFor("Josie Kins", "Josie Kins"), []);
  assert.deepEqual(defectsFor("EC50 0.63 nM", "EC50 0.63 nM"), []);
});

test("a dropped citation marker blocks publication", () => {
  const source = "Liver toxicity has been reported.[cite:skryabin-2023-review]";
  const defects = defectsFor(source, "已有肝毒性报告。");

  assert.ok(defects.includes(DEFECT_CODES.CITATION_LOSS));
  assert.equal(isBlocking(defects), true);
  assert.deepEqual(extractCiteMarkers(source), ["[cite:skryabin-2023-review]"]);
});

test("the unresolved citation placeholder counts as a marker", () => {
  assert.deepEqual(extractCiteMarkers("Reported widely.[citation-needed]"), ["[citation-needed]"]);
  assert.ok(
    defectsFor("Reported widely.[citation-needed]", "已被广泛报道。").includes(DEFECT_CODES.CITATION_LOSS),
  );
});

test("glossary drift is reported without blocking, and only for terms the source mentions as whole words", () => {
  const glossary = { comedown: "退效", tolerance: "耐受性" };
  const defects = validateSegment({ source: "The comedown is gentle.", target: "退坡很温和。", locale: zh, glossary });

  assert.ok(defects.defects.includes(DEFECT_CODES.GLOSSARY_MISS));
  assert.deepEqual(defects.details.glossaryMisses, ["comedown"]);
  assert.equal(isBlocking(defects.defects), false);
  // "comedowns" is not "comedown", and a segment without a glossary never drifts.
  assert.equal(validateSegment({ source: "The comedowns vary.", target: "退坡各异。", locale: zh, glossary }).defects.includes(DEFECT_CODES.GLOSSARY_MISS), false);
  assert.equal(defectsFor("The comedown is gentle.", "退坡很温和。").includes(DEFECT_CODES.GLOSSARY_MISS), false);
});

test("model replies survive fences and surrounding prose", () => {
  assert.deepEqual(parseModelJson('```json\n{"s0":"甲"}\n```').value, { s0: "甲" });
  assert.deepEqual(parseModelJson('Here you go: {"s0":"甲"} done').value, { s0: "甲" });
  assert.equal(parseModelJson("no json here").code, DEFECT_CODES.UNPARSABLE_OUTPUT);
  assert.equal(parseModelJson("").code, DEFECT_CODES.EMPTY_OUTPUT);
});
