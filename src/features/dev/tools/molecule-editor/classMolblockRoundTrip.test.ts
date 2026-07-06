import { describe, expect, it } from "vitest";
import * as OCL from "openchemlib";
import {
  classAtomLabels,
  normalizeClassMolblock,
  parseClassDummies,
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
});
