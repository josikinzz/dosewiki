import { describe, expect, it } from "vitest";

import {
  MISSING_OPSIN,
  MISSING_PUBCHEM,
  MISSING_STRUCTURE,
  buildChemistryAuditReport,
  classifyAuditRow,
  compareStandardInchi,
  extractChemistryAuditRows,
  type OpsinResolution,
  type PubchemResolution,
  type StructureResolution,
} from "./iupacNameAudit";

const LSD_INCHI =
  "InChI=1S/C20H25N3O/c1-4-23(5-2)20(24)14-9-16-15-7-6-8-17-19(15)13(11-21-17)10-18(16)22(3)12-14/h6-9,11,14,18,21H,4-5,10,12H2,1-3H3/t14-,18-/m1/s1";

function resolvedStructure(inchi: string, inchiKey = "TEST-INCHI-KEY"): StructureResolution {
  return {
    status: "success",
    inchi,
    inchiKey,
    canonicalSmiles: "canonical",
  };
}

function parsedName(status: "success" | "warning" = "success"): OpsinResolution {
  return {
    status,
    message: status === "warning" ? "Parser warning" : "",
    smiles: "parsed",
    standardInchi: LSD_INCHI,
    standardInchiKey: "VAYOSLLFUXYJDT-RDTXWAMCSA-N",
    httpStatus: 200,
  };
}

function pubchemCandidate(iupacName: string): PubchemResolution {
  return {
    status: "success",
    message: "",
    cid: 5761,
    title: "LSD",
    iupacName,
    smiles: "candidate",
    inchiKey: "VAYOSLLFUXYJDT-RDTXWAMCSA-N",
    molecularFormula: "C20H25N3O",
    recordCount: 1,
    httpStatus: 200,
  };
}

describe("IUPAC name audit", () => {
  it("classifies the structural layer in which standard InChI values diverge", () => {
    expect(compareStandardInchi(LSD_INCHI, LSD_INCHI)).toEqual({ kind: "exact", exact: true });
    expect(
      compareStandardInchi(
        "InChI=1S/C11H13NO3/c1-2",
        "InChI=1S/C11H15NO2/c1-2",
      ),
    ).toEqual({ kind: "constitutional", exact: false });
    expect(
      compareStandardInchi(
        "InChI=1S/C14H26N4O11P2/c1-2/h1H",
        "InChI=1S/C14H26N4O11P2/c1-2/h1H/p+1",
      ),
    ).toEqual({ kind: "charge_or_protonation", exact: false });
    expect(
      compareStandardInchi(
        "InChI=1S/C15H10ClFN4S/c1-2/h7H2",
        "InChI=1S/C15H10ClFN4S/c1-2/h7,14H",
      ),
    ).toEqual({ kind: "hydrogen_or_bonding", exact: false });
    expect(
      compareStandardInchi(
        "InChI=1S/C4H8O/c1-2/t2-/m1/s1",
        "InChI=1S/C4H8O/c1-2/t2+/m1/s1",
      ),
    ).toEqual({ kind: "stereochemistry", exact: false });
  });

  it("passes structurally identical alternative LSD names without preferring PubChem text", () => {
    const row = classifyAuditRow({
      row: {
        slug: "lsd",
        title: "LSD",
        smiles: "stored",
        iupacName: "tetracyclic systematic name",
        storedInchiKey: "VAYOSLLFUXYJDT-RDTXWAMCSA-N",
      },
      sourceStructure: resolvedStructure(LSD_INCHI, "VAYOSLLFUXYJDT-RDTXWAMCSA-N"),
      currentNameOpsin: parsedName(),
      currentNameStructure: resolvedStructure(LSD_INCHI),
      pubchem: pubchemCandidate("fused-ring systematic name"),
      candidateOpsin: parsedName(),
      candidateStructure: resolvedStructure(LSD_INCHI),
    });

    expect(row.status).toBe("exact_match");
    expect(row.reviewReasons).toEqual([]);
    expect(row.recommendedCandidate).toBeNull();
  });

  it("accepts a reviewed source decision only for its exact stored name and structure key", () => {
    const scopolamineName =
      "(1R,2R,4S,5S,7S)-9-methyl-3-oxa-9-azatricyclo[3.3.1.0^{2,4}]nonan-7-yl (2S)-3-hydroxy-2-phenylpropanoate";
    const input = {
      row: {
        slug: "scopolamine",
        title: "Scopolamine",
        smiles: "stored",
        iupacName: scopolamineName,
        storedInchiKey: null,
      },
      currentNameOpsin: parsedName(),
      currentNameStructure: resolvedStructure(`${LSD_INCHI}/t20+`),
      pubchem: pubchemCandidate("candidate with incomplete stereochemistry"),
      candidateOpsin: parsedName(),
      candidateStructure: resolvedStructure(`${LSD_INCHI}/t20+`),
    };

    const accepted = classifyAuditRow({
      ...input,
      sourceStructure: resolvedStructure(LSD_INCHI, "STECJAGHUSJQJN-FWXGHANASA-N"),
    });
    const changedStructure = classifyAuditRow({
      ...input,
      sourceStructure: resolvedStructure(LSD_INCHI, "CHANGED-STRUCTURE-KEY"),
    });

    expect(accepted.status).toBe("source_verified_match");
    expect(accepted.reviewReasons).toEqual([]);
    expect(accepted.reviewDecision?.sourceName).toBe(
      "FDA Global Substance Registration System UNII DL48G20X8X",
    );
    expect(changedStructure.status).toBe("structure_mismatch");
    expect(changedStructure.reviewDecision).toBeNull();
  });

  it("recommends a generated name only after an exact round trip", () => {
    const sourceInchi = "InChI=1S/C11H13NO3/c1-2/h1H";
    const wrongNameInchi = "InChI=1S/C11H15NO2/c1-3/h1H";
    const row = classifyAuditRow({
      row: {
        slug: "methylone",
        title: "Methylone",
        smiles: "stored",
        iupacName: "wrong name",
        storedInchiKey: null,
      },
      sourceStructure: resolvedStructure(sourceInchi),
      currentNameOpsin: parsedName(),
      currentNameStructure: resolvedStructure(wrongNameInchi),
      pubchem: pubchemCandidate("structure-derived candidate"),
      candidateOpsin: parsedName(),
      candidateStructure: resolvedStructure(sourceInchi),
    });

    expect(row.status).toBe("structure_mismatch");
    expect(row.comparison?.kind).toBe("constitutional");
    expect(row.recommendedCandidate).toBe("structure-derived candidate");
    expect(row.reviewReasons).toContain("structure_mismatch:constitutional");
  });

  it("withholds an unverified replacement and reports stored InChIKey drift", () => {
    const row = classifyAuditRow({
      row: {
        slug: "scopolamine",
        title: "Scopolamine",
        smiles: "stored",
        iupacName: "parser-limited name",
        storedInchiKey: "STALE-KEY",
      },
      sourceStructure: resolvedStructure(LSD_INCHI, "COMPUTED-KEY"),
      currentNameOpsin: {
        ...MISSING_OPSIN,
        status: "unparsed",
        message: "CIP assignment failed",
      },
      currentNameStructure: MISSING_STRUCTURE,
      pubchem: pubchemCandidate("candidate with incomplete stereochemistry"),
      candidateOpsin: parsedName(),
      candidateStructure: resolvedStructure(`${LSD_INCHI}/t20+`),
    });

    expect(row.status).toBe("name_unparsed");
    expect(row.recommendedCandidate).toBeNull();
    expect(row.reviewReasons).toEqual([
      "name_unparsed",
      "stored_inchi_key_mismatch",
      "replacement_candidate_not_round_trip_safe",
    ]);
  });

  it("keeps missing identifiers as coverage gaps instead of invented compounds", () => {
    const extracted = extractChemistryAuditRows([
      { slug: "complete", title: "Complete", identification: { smiles: " CCO ", iupac_name: " ethanol " } },
      { slug: "plant", title: "Plant", identification: { smiles: "CN", iupac_name: "" } },
      { slug: "mixture", title: "Mixture", identification: { iupac_name: "component A; component B" } },
      { slug: "empty", title: "Empty", identification: {} },
    ]);
    const classified = extracted.map((row) =>
      classifyAuditRow({
        row,
        sourceStructure: row.smiles ? resolvedStructure(LSD_INCHI) : MISSING_STRUCTURE,
        currentNameOpsin: row.iupacName ? parsedName() : MISSING_OPSIN,
        currentNameStructure: row.iupacName ? resolvedStructure(LSD_INCHI) : MISSING_STRUCTURE,
        pubchem: row.smiles ? pubchemCandidate("candidate") : MISSING_PUBCHEM,
        candidateOpsin: row.smiles ? parsedName() : MISSING_OPSIN,
        candidateStructure: row.smiles ? resolvedStructure(LSD_INCHI) : MISSING_STRUCTURE,
      }),
    );
    const report = buildChemistryAuditReport({
      rows: classified,
      generatedAt: "2026-08-25T00:00:00.000Z",
      targetIdentity: "localhost/dosewiki",
      rdkitVersion: "test",
      opsinEndpoint: "https://opsin.test",
      pubchemEndpoint: "https://pubchem.test",
    });

    expect(report.summary).toMatchObject({
      total: 4,
      withSmiles: 2,
      withIupac: 2,
      withBoth: 1,
    });
    expect(report.summary.statusCounts).toMatchObject({
      exact_match: 1,
      missing_iupac: 1,
      missing_smiles: 1,
      missing_both: 1,
    });
    expect(report.coverageGaps.map((row) => row.slug)).toEqual(["empty", "mixture", "plant"]);
  });
});
