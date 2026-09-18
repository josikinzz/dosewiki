import test from "node:test";
import assert from "node:assert/strict";

import { extractMarkedSentences, findRecoverableSentences } from "./recover-dropped-sentences.mjs";

const supported = (fieldPath, referenceIds, claimText) => ({ status: "supported", fieldPath, referenceIds, claimText });

test("extractMarkedSentences yields only marked sentences, each with its whole marker cluster", () => {
  const sentences = extractMarkedSentences(
    "Alpha is a stimulant used in research.[cite:ref-a] Beta was described in 1990. Gamma acts on GABA receptors. [cite:ref-b][cite:ref-c]",
  );

  assert.deepEqual(sentences, [
    { host: "Alpha is a stimulant used in research.", ids: ["ref-a"], endsWithPunctuation: true },
    { host: "Gamma acts on GABA receptors.", ids: ["ref-b", "ref-c"], endsWithPunctuation: true },
  ]);
});

test("recovers a sentence whose text is unchanged and rejects a sibling sentence whose text changed, even though both cite the same reference id in the same field", () => {
  const originalText =
    "Zopiclone is a Z-drug hypnotic used for insomnia treatment purposes.[cite:ref-a] " +
    "First introduced by Acme Pharma in 1986, it works on GABA receptors.[cite:ref-a]";
  // Live text kept the first sentence verbatim but rewrote the second.
  const currentText =
    "Zopiclone is a Z-drug hypnotic used for insomnia treatment purposes. " +
    "It was later reformulated and released under a different brand name.";
  const evidence = [
    supported("summary", ["ref-a"], "Zopiclone is a Z-drug hypnotic used for insomnia treatment purposes."),
    supported("summary", ["ref-a"], "First introduced by Acme Pharma in 1986"),
  ];

  const results = findRecoverableSentences({ originalText, currentText, fieldPath: "summary", evidence });

  assert.deepEqual(results, [
    { host: "Zopiclone is a Z-drug hypnotic used for insomnia treatment purposes.", ids: ["ref-a"], status: "recoverable" },
    {
      host: "First introduced by Acme Pharma in 1986, it works on GABA receptors.",
      ids: ["ref-a"],
      status: "rejected",
      reason: "not_found_in_live_text",
    },
  ]);
});

test("rejects a sentence that is textually present but whose only matching evidence row belongs to a different, unrecovered claim", () => {
  // Same field path + same reference id, but the sentence text does not
  // contain the evidence row's claim text. This is the exact bug shape that
  // over-restored evidence for zopiclone's summary section.
  const originalText = "A common side effect is drowsiness.[cite:ref-b]";
  const currentText = "A common side effect is drowsiness.";
  const evidence = [supported("summary", ["ref-b"], "A totally unrelated claim about dosing.")];

  const results = findRecoverableSentences({ originalText, currentText, fieldPath: "summary", evidence });

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason, "no_matching_evidence_row_for_sentence");
});

test("requires every marker in a cluster to have its own supported evidence row", () => {
  const host = "Ketamine is a dissociative anaesthetic used in medicine.";
  const originalText = `${host}[cite:ref-a][cite:ref-b]`;
  const evidence = [supported("summary", ["ref-a"], host)];

  const results = findRecoverableSentences({ originalText, currentText: host, fieldPath: "summary", evidence });

  assert.deepEqual(results, [{ host, ids: ["ref-a", "ref-b"], status: "rejected", reason: "no_matching_evidence_row_for_sentence" }]);

  const covered = findRecoverableSentences({
    originalText,
    currentText: host,
    fieldPath: "summary",
    evidence: [...evidence, supported("summary", ["ref-b"], host)],
  });
  assert.deepEqual(covered, [{ host, ids: ["ref-a", "ref-b"], status: "recoverable" }]);
});

test("ignores evidence rows that are not supported or belong to another field", () => {
  const host = "Psilocybin is a naturally occurring psychedelic prodrug.";
  const originalText = `${host}[cite:ref-a]`;

  const unsupported = findRecoverableSentences({
    originalText,
    currentText: host,
    fieldPath: "summary",
    evidence: [{ status: "refuted", fieldPath: "summary", referenceIds: ["ref-a"], claimText: host }],
  });
  assert.equal(unsupported[0].reason, "no_matching_evidence_row_for_sentence");

  const otherField = findRecoverableSentences({
    originalText,
    currentText: host,
    fieldPath: "summary",
    evidence: [supported("pharmacology", ["ref-a"], host)],
  });
  assert.equal(otherField[0].reason, "no_matching_evidence_row_for_sentence");
});

test("matches evidence field paths through index normalization so dotted and bracketed spellings agree", () => {
  const host = "Oral bioavailability is reported to be around forty percent.";
  const originalText = `${host}[cite:ref-a]`;
  const evidence = [supported("dosage.routes.0.notes", ["ref-a"], host)];

  const results = findRecoverableSentences({ originalText, currentText: host, fieldPath: "dosage.routes[0].notes", evidence });

  assert.deepEqual(results, [{ host, ids: ["ref-a"], status: "recoverable" }]);
});

test("rejects fragments that are too short to be a safe anchor", () => {
  const originalText = "Short claim here.[cite:ref-a]";
  const evidence = [supported("summary", ["ref-a"], "Short claim here.")];

  const results = findRecoverableSentences({ originalText, currentText: "Short claim here.", fieldPath: "summary", evidence });

  assert.deepEqual(results, [
    { host: "Short claim here.", ids: ["ref-a"], status: "rejected", reason: "fragment_too_short_or_no_terminal_punctuation" },
  ]);
});

test("rejects a host sentence that occurs more than once in the live text", () => {
  const host = "The compound was first synthesized in the late nineteenth century.";
  const originalText = `${host}[cite:ref-a]`;
  const currentText = `${host} Later work confirmed this. ${host}`;
  const evidence = [supported("summary", ["ref-a"], host)];

  const results = findRecoverableSentences({ originalText, currentText, fieldPath: "summary", evidence });

  assert.deepEqual(results, [{ host, ids: ["ref-a"], status: "rejected", reason: "ambiguous_multiple_occurrences" }]);
});

test("accepts an evidence row whose claim text is a superset of the recovered host sentence", () => {
  const host = "Mescaline is a naturally occurring phenethylamine psychedelic.";
  const originalText = `${host}[cite:ref-a]`;
  const evidence = [supported("summary", ["ref-a"], `${host} It occurs in peyote and San Pedro cacti.`)];

  const results = findRecoverableSentences({ originalText, currentText: host, fieldPath: "summary", evidence });

  assert.deepEqual(results, [{ host, ids: ["ref-a"], status: "recoverable" }]);
});
