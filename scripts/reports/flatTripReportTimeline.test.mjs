import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLossless,
  firstDifferenceAt,
  formatFlatBody,
  readTimeHead,
  reconstructBody,
  splitParagraphs,
} from "./flatTripReportTimeline.mjs";

/**
 * A body with every structural feature the real submissions use: prose before
 * the timeline, a lead-in line ending in a colon, wall-clock and approximated
 * timestamps, a lead-in word before a timestamp, entries continued across
 * further paragraphs, and closing reflection after the last timestamp.
 */
const BODY = [
  "Preparation:",
  "Weighed nothing; the scale was broken.",
  "Trip report with approximate timestamps:",
  "6:30 PM: First glass of the tea.",
  "8:00 PM: Come-up. I put music on.",
  "I could see the wallpaper rippling: it was subtle at first.",
  "~8:40 PM: Lights out.",
  "9:56 PM: Ego death #2.",
  "10:00 PM: Loneliness, amplified.",
  "After 10:40 PM: Time loops.",
  "12:56 AM: Residual visual effects.",
  "Looking back, it was the most intense night of my life.",
  "I do not think I will do this again for a while.",
].join("\n\n");

const PLAN = { peakFrom: "~8:40 PM", offsetFrom: "10:00 PM", conclusionFrom: "Looking back," };

const format = (overrides = {}) => formatFlatBody({ body: BODY, ...PLAN, ...overrides });

test("reshaping a flat body reproduces it character for character", () => {
  const record = format();

  assert.equal(reconstructBody(record), BODY);
  assert.deepEqual(assertLossless(BODY, record), { characters: BODY.length });
});

test("prose before the first timestamp becomes the introduction, closing reflection the conclusion", () => {
  const record = format();

  assert.equal(
    record.introduction,
    "Preparation:\n\nWeighed nothing; the scale was broken.\n\nTrip report with approximate timestamps:",
  );
  assert.equal(
    record.conclusion,
    "Looking back, it was the most intense night of my life.\n\nI do not think I will do this again for a while.",
  );
});

test("the plan's boundaries decide the phases and every timestamp is kept verbatim", () => {
  const record = format();

  assert.deepEqual(
    record.onset.map((entry) => entry.time),
    ["6:30 PM", "8:00 PM"],
  );
  assert.deepEqual(
    record.peak.map((entry) => entry.time),
    ["~8:40 PM", "9:56 PM"],
  );
  assert.deepEqual(
    record.offset.map((entry) => entry.time),
    ["10:00 PM", "After 10:40 PM", "12:56 AM"],
  );
});

test("an untimed paragraph continues the entry above it instead of becoming its own", () => {
  const record = format();

  assert.equal(
    record.onset[1].description,
    "Come-up. I put music on.\n\nI could see the wallpaper rippling: it was subtle at first.",
  );
});

test("a description keeps a colon of its own", () => {
  const record = format();
  const continued = record.onset[1].description;

  assert.ok(continued.includes("rippling: it was subtle"));
  assert.equal(readTimeHead("I could see the wallpaper rippling: it was subtle at first."), null);
});

test("elapsed-time labels are recognised alongside wall-clock ones", () => {
  const body = [
    "Background.",
    "T+0:00: 50mg insufflated.",
    "T+0:25: Peak.",
    "T+1:00: Coming down.",
    "In hindsight the dose was too low.",
  ].join("\n\n");

  const record = formatFlatBody({
    body,
    peakFrom: "T+0:25",
    offsetFrom: "T+1:00",
    conclusionFrom: "In hindsight",
  });

  assert.equal(reconstructBody(record), body);
  assert.deepEqual(record.onset.map((entry) => entry.time), ["T+0:00"]);
  assert.deepEqual(record.peak.map((entry) => entry.time), ["T+0:25"]);
  assert.deepEqual(record.offset.map((entry) => entry.time), ["T+1:00"]);
});

test("no word of the source is dropped or reordered", () => {
  const record = format();
  const words = (text) => text.split(/\s+/).filter(Boolean);

  assert.deepEqual(words(reconstructBody(record)), words(BODY));
});

test("a body whose paragraphs are separated by more than one blank line is refused", () => {
  for (const body of ["One.\n\n\nTwo.", "One.\n\n\n\nTwo."]) {
    assert.throws(() => splitParagraphs(body), /not separated by exactly one blank line/);
  }
});

test("a paragraph padded with spaces is refused rather than silently trimmed", () => {
  assert.throws(() => splitParagraphs("One.  \n\nTwo."), /leading or trailing whitespace/);
});

test("a body with untrimmed edges is refused rather than silently trimmed", () => {
  assert.throws(() => splitParagraphs(`${BODY}\n`), /leading or trailing whitespace/);
});

test("a body with no timestamp is refused", () => {
  assert.throws(
    () => formatFlatBody({ body: "Just prose.\n\nMore prose.", ...PLAN }),
    /no timestamped paragraph/,
  );
});

test("a phase boundary that names no timestamp is refused", () => {
  assert.throws(() => format({ peakFrom: "9:00 PM" }), /peak start.*matches no timestamp/);
  assert.throws(() => format({ offsetFrom: "11:11 PM" }), /offset start.*matches no timestamp/);
});

test("a conclusion boundary that matches nothing, or matches twice, is refused", () => {
  assert.throws(() => format({ conclusionFrom: "Nowhere in the body" }), /matches no paragraph/);

  const repeated = ["6:30 PM: Dose.", "9:00 PM: Peak.", "Same.", "Same."].join("\n\n");
  assert.throws(
    () => formatFlatBody({ body: repeated, peakFrom: "9:00 PM", offsetFrom: "9:00 PM", conclusionFrom: "Same." }),
    /matches 2 paragraphs/,
  );
});

test("phase boundaries out of order are refused", () => {
  assert.throws(() => format({ peakFrom: "6:30 PM" }), /leaves the onset empty/);
  assert.throws(() => format({ offsetFrom: "~8:40 PM" }), /offset start at or before the peak start/);
});

test("assertLossless reports where the text diverged", () => {
  const record = format();
  const edited = {
    ...record,
    peak: [{ ...record.peak[0], description: "Lights off." }, record.peak[1]],
  };

  assert.throws(() => assertLossless(BODY, edited), /first difference at character/);
});

test("firstDifferenceAt locates a divergence and reports equality as -1", () => {
  assert.equal(firstDifferenceAt("abc", "abc"), -1);
  assert.equal(firstDifferenceAt("abc", "abd"), 2);
  assert.equal(firstDifferenceAt("abc", "abcd"), 3);
});
