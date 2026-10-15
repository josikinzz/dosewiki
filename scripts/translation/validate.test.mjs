import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocale } from "./locales.mjs";
import {
  DEFECT_CODES,
  compareNumbers,
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

// The live zh-Hans catalog entry a reviewer reported: doubled commas around a
// class name the model left in English (content/i18n/messages/zh-Hans.json).
