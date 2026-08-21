import { describe, expect, it } from "vitest";
import * as OCL from "openchemlib";
import {
  classAtomLabels,
  normalizeClassMolblock,
  parseClassDummies,
  stripOclCustomLabelSgroups,
} from "./applyRLabelsToMolblock";
import { RDKIT_PHENETHYLAMINE, R_LABELS } from "./classMolblockFixture";

/**
 * The full class-mode editor chain against real OpenChemLib: OCL mangles dummy
 * atoms ("?" symbols, dropped atom maps) on every round-trip, and
 * normalizeClassMolblock must restore them so the guard, preview labels, and
 * saved override all keep working after an edit.
 */
describe("class molblock -> OCL editor round-trip", () => {
  it("survives an OpenChemLib load/re-emit with maps and labels intact", () => {
    const dummies = parseClassDummies(RDKIT_PHENETHYLAMINE);
    expect(dummies).toHaveLength(8);

    const molecule = OCL.Molecule.fromMolfile(RDKIT_PHENETHYLAMINE);
    expect(molecule.getAllAtoms()).toBe(17);
    const roundTripped = molecule.toMolfile();

    const normalized = normalizeClassMolblock(roundTripped, RDKIT_PHENETHYLAMINE, dummies);
    // all R positions recoverable again: same dummies, same map numbers
    const dummiesAfter = parseClassDummies(normalized);
    expect(dummiesAfter).toEqual(dummies);
    // and they resolve to the full label set for draw-time injection
    const labels = classAtomLabels(dummiesAfter, R_LABELS);
    expect(Object.keys(labels)).toHaveLength(8);
  });

  it("strips the DAT S-groups custom labels add to toMolfile, restoring the unlabeled emission", () => {
    const unlabeled = OCL.Molecule.fromMolfile(RDKIT_PHENETHYLAMINE).toMolfile();

    const molecule = OCL.Molecule.fromMolfile(RDKIT_PHENETHYLAMINE);
    const labels = classAtomLabels(parseClassDummies(RDKIT_PHENETHYLAMINE), R_LABELS);
    for (const [index, label] of Object.entries(labels)) {
      molecule.setAtomCustomLabel(Number(index), label);
    }
    const labeled = molecule.toMolfile();

    // Labels leak into the molfile text (verified: STY/SLB/SAL/SDT/SDD/SED per
    // label); the canvas emission path must strip them back to the exact text a
    // label-free molecule emits, or the unsaved-changes flag false-positives.
    expect(labeled).not.toBe(unlabeled);
    expect(labeled).toContain("NOSEARCH_OCL_CUSTOM_LABEL");
    expect(stripOclCustomLabelSgroups(labeled)).toBe(unlabeled);
  });
});
