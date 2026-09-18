import { describe, expect, it } from "vitest";

import { parseSource } from "../scripts/parsers/registry";

describe("DrugBank parser", () => {
  it("preserves structured chemistry, pharmacology, interactions, and overview narratives after decomposition", () => {
    const result = parseSource(
      "drugbank",
      `## Overview
### Description
Fixtureamine is a synthetic DrugBank fixture used to exercise structured parsing paths.

### Background
It appears here only for parser coverage.

### Indication
Studied as a hypothetical compound.

### Pharmacodynamics
Fixtureamine acts as an agonist at serotonin receptors in this example.

### Toxicity
High doses may increase cardiovascular strain.

## Chemical Information
**Chemical Formula:** C
13
H
18
O
2

**SMILES:** CC1=CC=CC=C1O
**IUPAC Name:** 2-ethyl fictional parser compound
**Weight:** 206.28
**InChI:** InChI=1S/C13H18O2/example

## Additional Information
### CAS number
15687-27-1

### InChI Key
ABCDEFGHIJKLMN-OPQRSTUVSA-N

### Half-life
About 6 hours in this fixture.

### Absorption
Rapid oral absorption in this fixture.

### Metabolism
Primarily hepatic metabolism in this fixture.

### Mechanism of Action
5-HT2A receptor
Agonist
NMDA receptor
Antagonist

### Drug Interactions
Tramadol
Can be increased and may raise the risk or severity of serotonin syndrome.

Alcohol
May increase CNS depression and sedative burden.

### Food Interactions
Avoid grapefruit juice
Take with food if nausea occurs`,
      "Fixtureamine",
    );

    expect(result?.chemistry).toMatchObject({
      formula: "C13H18O2",
      smiles: "CC1=CC=CC=C1O",
      iupac: "2-ethyl fictional parser compound",
      molecularWeight: "206.28",
      cas: "15687-27-1",
      inchi: "InChI=1S/C13H18O2/example",
      inchiKey: "ABCDEFGHIJKLMN-OPQRSTUVSA-N",
      sources: ["drugbank"],
    });
    expect(result?.pharmacology).toMatchObject({
      halfLife: "About 6 hours in this fixture.",
      bioavailability: "Rapid oral absorption in this fixture.",
      metabolism: "Primarily hepatic metabolism in this fixture.",
      mechanismOfAction: [
        "5-HT2A receptor: agonist",
        "NMDA receptor: antagonist",
      ],
      receptors: [
        { name: "5-HT2A receptor", action: "agonist" },
        { name: "NMDA receptor", action: "antagonist" },
      ],
      sources: ["drugbank"],
    });
    expect(result?.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ substance: "Tramadol", severity: "dangerous" }),
        expect.objectContaining({ substance: "Alcohol", severity: "caution" }),
      ]),
    );
    expect(result?.harmReduction).toMatchObject({
      rules: [
        "Food interaction: Avoid grapefruit juice",
        "Food interaction: Take with food if nausea occurs",
      ],
      sources: ["drugbank"],
    });
    expect(result?.narrativeContent.generalNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "description" }),
        expect.objectContaining({ section: "background" }),
        expect.objectContaining({ section: "indication" }),
        expect.objectContaining({ section: "toxicity" }),
        expect.objectContaining({ section: "pharmacodynamics" }),
      ]),
    );
    expect(result?.sectionsExtracted).toEqual(
      expect.arrayContaining([
        "chemistry",
        "pharmacology",
        "interactions",
        "food_interactions",
        "overview",
      ]),
    );
  });
});
