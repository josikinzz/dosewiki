import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocale } from "./locales.mjs";
import { buildQaPacket } from "./qa-packet.mjs";

test("the QA packet counts doubled punctuation as blocking and leftover Latin as a note", () => {
  const units = [
    { hash: "a", group: "summary", contextClass: "general", words: 10, source: "The phenidates, esters, are known." },
    { hash: "b", group: "summary", contextClass: "general", words: 10, source: "The phenidates are stimulants." },
  ];
  const translations = new Map([
    ["a", { target: "酯类，，phenidates，，最知名。", defects: ["REPEATED_PUNCTUATION", "LEFTOVER_LATIN"] }],
    ["b", { target: "phenidates 是兴奋剂。", defects: ["LEFTOVER_LATIN"] }],
  ]);
  const packet = buildQaPacket({
    locale: resolveLocale("zh-Hans"),
    model: "test",
    manifest: { source: "test", sourceGeneratedAt: null },
    segments: units.map((unit) => ({ slug: "x", group: unit.group })),
    units,
    translations,
    failures: [],
    usage: { requests: 1, retries: 0, prompt: 0, completion: 0 },
    cost: 0,
    elapsedMs: 0,
    structuralDiff: [],
    applied: 2,
    missing: 0,
  });

  assert.equal(packet.repeatedPunctuation, 1);
  assert.equal(packet.nonBlockingNotes.leftoverLatin, 2);
  assert.equal(packet.coverage.validatedUnits, 1);
});
