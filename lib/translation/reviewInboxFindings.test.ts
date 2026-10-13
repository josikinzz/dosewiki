// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mentionsTerm } from "../../scripts/translation/term-match.mjs";
import { scanInboxFindings } from "./reviewInboxFindings";

const terms = ["Phenidate", "Replication", "come-up", "2C-B", "5-HT2A", "Light", "Ego death", "A", "Visual drifting", "Nitrogen oxide", "3,5-Dimethoxyphenethylamine (scalines)"];
const sources = ["phenidates and replicating", "The come-ups from 2C-B involve 5-HT2A.", "Lightheadedness is different from Light.", "EGO DEATH with visual drifts", "Nitrogen oxides, not nitric oxide.", "A 3,5-dimethoxyphenethylamine (scalines) reference."];

describe("Waiting glossary scan", () => {
  it("keeps the shared matcher's inflections, phrases, short terms and chemical punctuation", () => {
    const glossary = terms.map((term) => ({ term, target: "译文", kind: "", revision: "1" }));
    const units = sources.map((source, index) => ({ hash: String(index), source }));
    const findings = scanInboxFindings({
      inventory: { generatedAt: 1, records: [{ kind: "article", slug: "sample", units }] },
      stored: new Map(units.map((unit) => [unit.hash, "Missing rendering"])),
      rejections: new Map(), glossary, chinese: false,
    });
    expect(findings.map((finding) => [finding.hash, finding.term])).toEqual(units.flatMap((unit) =>
      glossary.filter((entry) => mentionsTerm(unit.source, entry.term)).map((entry) => [unit.hash, entry.term])));
  });

  it("checks each human wording independently and keeps intentional glossary exceptions", () => {
    const input = {
      inventory: { generatedAt: 1, records: [{ kind: "article" as const, slug: "sample", units: [{ hash: "h", source: "Phenidates" }] }] },
      stored: new Map([["h", "哌甲酯类"]]), rejections: new Map(),
      glossary: [{ term: "Phenidate", target: "哌甲酯类", kind: "chemical-class", revision: "1" }], chinese: true,
      corrections: new Map([["sample", new Map([["h", { machineShown: true, targets: [
        { target: "另一种说法", glossaryExceptions: [] },
        { target: "有意例外", glossaryExceptions: ["Phenidate"] },
      ] }]])]]),
    };
    expect(scanInboxFindings(input).map((finding) => finding.target)).toEqual(["另一种说法"]);
  });
});
