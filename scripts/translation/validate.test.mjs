import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocale } from "./locales.mjs";
import {
  DEFECT_CODES,
  compareNumbers,
  extractNumbers,
  isBlocking,
  validateSegment,
} from "./validate.mjs";

const zh = resolveLocale("zh-Hans");

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

test("a scale word does not excuse a wrong quantity", () => {
  assert.deepEqual(compareNumbers("revenue of $3 billion", "收入为20亿美元").dropped, ["3"]);
});

test("chemical labels do not exempt a changed or dropped dose", () => {
  for (const target of ["异噁唑的剂量为200 mg。", "异噁唑的剂量。"])
    assert.ok(defectsFor("The isoxazole dose is 20 mg.", target).includes(DEFECT_CODES.NUMBER_MISMATCH));
});

test("receptor names do not count as measurements", () => {
  assert.deepEqual(extractNumbers("Binding at 5-HT2A and 5-HT2C receptors"), []);
  assert.deepEqual(extractNumbers("Doses of 330-650 mg"), ["330", "650"]);
});
