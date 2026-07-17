import test from "node:test";
import assert from "node:assert/strict";

// findRecoverableSentences isn't exported (the module's main() drives Convex
// I/O), so this test exercises the exported helpers plus a local copy of the
// pure sentence-matching logic to guard the fix directly: an evidence row
// must not be restored just because it shares a field path and reference id
// with a recovered sentence — its own claim text must be inside that sentence.

import { normalizeFieldPath } from "./rebase-workbench-draft.mjs";

const MIN_HOST_LENGTH = 25;
const SENTENCE_WITH_MARKERS = /([^.!?]*[.!?])((?:\s*\[cite:[^\]]+\])+)/g;
const MARKER_PATTERN = /\[cite:([^\]\s]+)\]/g;

function extractMarkedSentences(text) {
  const sentences = [];
  for (const match of text.matchAll(SENTENCE_WITH_MARKERS)) {
    const host = match[1].trim();
    const ids = [...match[2].matchAll(MARKER_PATTERN)].map((m) => m[1]);
    sentences.push({ host, ids, endsWithPunctuation: /[.!?]$/.test(host) });
  }
  return sentences;
}

function findRecoverableSentences({ originalText, currentText, fieldPath, evidence }) {
  const candidates = [];
  for (const { host, ids, endsWithPunctuation } of extractMarkedSentences(originalText)) {
    if (!host || host.length < MIN_HOST_LENGTH || !endsWithPunctuation) {
      candidates.push({ host, ids, status: "rejected", reason: "fragment_too_short_or_no_terminal_punctuation" });
      continue;
    }
    const occurrences = currentText.split(host).length - 1;
    if (occurrences !== 1) {
      candidates.push({ host, ids, status: "rejected", reason: occurrences === 0 ? "not_found_in_live_text" : "ambiguous_multiple_occurrences" });
      continue;
    }
    const normalizedFieldPath = normalizeFieldPath(fieldPath);
    const hasEvidence = ids.every((id) =>
      (evidence ?? []).some((row) => {
        if (row.status !== "supported") return false;
        if (normalizeFieldPath(row.fieldPath ?? "") !== normalizedFieldPath) return false;
        if (!(row.referenceIds ?? []).includes(id)) return false;
        const claimText = (row.claimText ?? "").trim();
        return claimText.length > 0 && (host.includes(claimText) || claimText.includes(host));
      }));
    if (!hasEvidence) {
      candidates.push({ host, ids, status: "rejected", reason: "no_matching_evidence_row_for_sentence" });
      continue;
    }
    candidates.push({ host, ids, status: "recoverable" });
  }
  return candidates;
}

test("recovers a sentence whose text is unchanged and rejects a sibling sentence whose text changed, even though both cite the same reference id in the same field", () => {
  const originalText =
    "Zopiclone is a Z-drug hypnotic used for insomnia treatment purposes.[cite:ref-a] " +
    "First introduced by Acme Pharma in 1986, it works on GABA receptors.[cite:ref-a]";
  // Live text kept the first sentence verbatim but rewrote the second.
  const currentText =
    "Zopiclone is a Z-drug hypnotic used for insomnia treatment purposes. " +
    "It was later reformulated and released under a different brand name.";
  const evidence = [
    { status: "supported", fieldPath: "summary", referenceIds: ["ref-a"], claimText: "Zopiclone is a Z-drug hypnotic used for insomnia treatment purposes." },
    { status: "supported", fieldPath: "summary", referenceIds: ["ref-a"], claimText: "First introduced by Acme Pharma in 1986" },
  ];

  const results = findRecoverableSentences({ originalText, currentText, fieldPath: "summary", evidence });

  assert.equal(results.length, 2);
  assert.equal(results[0].status, "recoverable");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason, "not_found_in_live_text");
});

test("rejects a sentence that is textually present but whose only matching evidence row belongs to a different, unrecovered claim", () => {
  // Same field path + same reference id, but the sentence text does not
  // contain the evidence row's claim text — this is the exact bug shape that
  // over-restored evidence for zopiclone's summary section.
  const originalText = "A common side effect is drowsiness.[cite:ref-b]";
  const currentText = "A common side effect is drowsiness.";
  const evidence = [
    { status: "supported", fieldPath: "summary", referenceIds: ["ref-b"], claimText: "A totally unrelated claim about dosing." },
  ];

  const results = findRecoverableSentences({ originalText, currentText, fieldPath: "summary", evidence });

  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason, "no_matching_evidence_row_for_sentence");
});
