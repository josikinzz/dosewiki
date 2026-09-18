import assert from "node:assert/strict";
import test from "node:test";

import { buildTermIndex, findCollisions, findDrift, findGlossaryDisagreements, findUnpinned } from "./glossary-audit.mjs";

/** A corpus pair shaped like the real artifacts: same structure, translated leaves. */
const corpus = (label, pairs) => ({
  label,
  source: { items: pairs.map(([source]) => ({ text: source })) },
  target: { items: pairs.map(([, target]) => ({ text: target })) },
});

test("two source terms sharing one rendering are reported as a collision", () => {
  const { terms } = buildTermIndex([corpus("a", [["Restricted", "受管制"], ["Controlled", "受管制"]])]);
  const [collision] = findCollisions(terms);
  assert.equal(collision.rendering, "受管制");
  assert.deepEqual(collision.sources, ["Controlled", "Restricted"]);
});

test("case and word order alone are not a collision", () => {
  const { terms } = buildTermIndex([
    corpus("a", [["Prescription only", "仅凭处方"], ["Prescription Only", "仅凭处方"], ["Loss of motor control", "运动控制丧失"], ["Motor control loss", "运动控制丧失"]]),
  ]);
  assert.deepEqual(findCollisions(terms), []);
});

test("one term rendered two ways across corpora is drift", () => {
  const { terms } = buildTermIndex([
    corpus("substances", [["Euphoria", "欣快感"]]),
    corpus("effects", [["Euphoria", "快感"]]),
  ]);
  const [drifted] = findDrift(terms);
  assert.equal(drifted.source, "Euphoria");
  assert.deepEqual(drifted.corpora.sort(), ["effects", "substances"]);
});

test("a term used consistently across corpora is not drift", () => {
  const { terms } = buildTermIndex([
    corpus("substances", [["Euphoria", "欣快感"]]),
    corpus("effects", [["Euphoria", "欣快感"]]),
  ]);
  assert.deepEqual(findDrift(terms), []);
});

test("a substring is not a mention: potential does not exercise potent", () => {
  const { terms, prose } = buildTermIndex([
    corpus("a", [
      ["Potent", "强效"],
      ["This compound carries a potential for dependence and should not be taken lightly by anyone.", "该化合物具有依赖性风险，任何人都不应轻视。"],
      ["This compound carries a potential for harm and should not be taken lightly by any reader.", "该化合物具有伤害风险，任何读者都不应轻视。"],
      ["This compound carries a potential for abuse and should not be taken lightly by new users.", "该化合物具有滥用风险，新使用者不应轻视。"],
    ]),
  ]);
  assert.deepEqual(findUnpinned(terms, prose), []);
});

test("a longer term shadows the shorter one it contains", () => {
  const sentence = (n) => [
    `Controlled as a Schedule I substance under the ${n} national statute, which lists it by name.`,
    `根据${n}国家法规被列为第一级管制物质，该法规按名称列出。`,
  ];
  const { terms, prose } = buildTermIndex([
    corpus("a", [["Schedule", "附表"], ["Schedule I", "第一级管制"], sentence("first"), sentence("second"), sentence("third")]),
  ]);
  // "Schedule" appears in all three sentences, but only as part of "Schedule I",
  // whose own rendering is present. Reporting "Schedule" here would be noise.
  assert.deepEqual(findUnpinned(terms, prose).map((finding) => finding.source), []);
});

test("an excluded sense removes its sentences from the count", () => {
  const rows = [
    ["Depression", "抑郁"],
    ["Respiratory depression is the primary cause of death in overdose cases involving this class.", "呼吸抑制是该类药物过量致死的主要原因。"],
    ["Respiratory depression becomes more likely when it is combined with any other sedative drug.", "与其他镇静药物合用时，呼吸抑制的可能性更高。"],
    ["Respiratory depression has been documented in several reports describing this exact combination.", "多份报告记录了这种组合导致的呼吸抑制。"],
  ];
  const { terms, prose } = buildTermIndex([corpus("a", rows)]);
  assert.equal(findUnpinned(terms, prose).length, 1, "without the exclusion the wrong sense is flagged");
  assert.deepEqual(findUnpinned(terms, prose, { excludedSenses: { Depression: ["respiratory depression"] } }), []);
});

test("a label absent from the prose that mentions it is reported with its samples", () => {
  const rows = [["Increased heart rate", "心率升高"]];
  for (const n of ["one", "two", "three"]) {
    rows.push([
      `Acute cardiovascular effects including increased heart rate have been reported in the ${n} study.`,
      `第${n}项研究报告了包括心率加快在内的急性心血管效应。`,
    ]);
  }
  const { terms, prose } = buildTermIndex([corpus("a", rows)]);
  const [finding] = findUnpinned(terms, prose);
  assert.equal(finding.source, "Increased heart rate");
  assert.equal(finding.pinned, "心率升高");
  assert.equal(finding.missing, 3);
  assert.equal(finding.mentions, 3);
  assert.match(finding.samples[0], /increased heart rate/);
});

test("statute titles are not scanned, because the pipeline never translates them", () => {
  const { prose } = buildTermIndex([
    corpus("a", [["Misuse of Drugs Act 1975, Schedule 2, Part 1, Class B controlled drug", "Misuse of Drugs Act 1975, Schedule 2, Part 1, Class B controlled drug"]]),
  ]);
  assert.deepEqual(prose, []);
});

test("an untranslated leaf contributes no rendering", () => {
  const { terms } = buildTermIndex([corpus("a", [["Serotonin", "Serotonin"], ["5-HT2A", "5-HT2A"]])]);
  assert.equal(terms.size, 0);
});

test("an approved gloss the corpus pins differently is a disagreement; agreement, case, and unknown terms are not", () => {
  const { terms } = buildTermIndex([
    corpus("effects", [["Euphoria", "欣快"], ["Euphoria", "欣快"], ["Anxiety", "焦虑"]]),
  ]);
  const findings = findGlossaryDisagreements(terms, { euphoria: "愉悦", Anxiety: "焦虑", Sedation: "镇静" });
  assert.deepEqual(findings, [{ source: "euphoria", approved: "愉悦", pinned: "欣快", occurrences: 2 }]);
});
