import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  OPSIN_MAP_RELATIVE_PATH,
  classifySmilesValue,
  createOpsinSmilesMapAdapter,
  mergeIdentifiersIntoIdentification,
  normalizeParsedChemistryIdentifiers,
} from "./identifier-provenance.mjs";
import { parseSource } from "../parsers/registry.ts";

const tmpRoots = [];

async function makeTmpRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-chemistry-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("chemistry identifier provenance", () => {
  it("normalizes parsed identifiers and molecular weight units", () => {
    const normalized = normalizeParsedChemistryIdentifiers({
      smiles: " CCO ",
      iupac: " ethanol ",
      cas: "64-17-5",
      formula: "C2H6O",
      molecularWeight: "46.07",
      inchiKey: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
      sources: ["fixture"],
    });

    expect(normalized.fields).toMatchObject({
      smiles: { value: "CCO", provenance: "parsed", state: "resolved", sources: ["fixture"] },
      iupac: { value: "ethanol" },
      molecularWeight: { value: "46.07 g/mol" },
      inchiKey: { value: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N" },
    });
  });

  it("reports null and mixture SMILES explicitly", () => {
    expect(classifySmilesValue(null)).toEqual({ state: "unresolved", value: undefined });

    const mixture = classifySmilesValue({
      components: {
        "Component A": " CCO ",
        "Component B": "CN",
      },
    });

    expect(mixture).toMatchObject({
      state: "mixture",
      components: {
        "Component A": "CCO",
        "Component B": "CN",
      },
    });
  });

  it("preserves stronger existing article identification values while filling empty fields", () => {
    const normalized = normalizeParsedChemistryIdentifiers({
      smiles: "CCO",
      iupac: "ethanol",
      sources: ["fixture"],
    });

    const merged = mergeIdentifiersIntoIdentification(
      {
        smiles: "existing-editor-smiles",
        iupac_name: "",
      },
      normalized,
    );

    expect(merged.identification).toMatchObject({
      smiles: "existing-editor-smiles",
      iupac_name: "ethanol",
    });
    expect(merged.changes).toEqual([expect.objectContaining({ field: "iupac_name" })]);
    expect(merged.skipped).toEqual([
      expect.objectContaining({ field: "smiles", reason: "existing_stronger_value" }),
    ]);
  });

  it("does not merge unresolved source values into empty article fields", () => {
    const normalized = normalizeParsedChemistryIdentifiers({
      smiles: null,
      sources: ["fixture"],
    });

    const merged = mergeIdentifiersIntoIdentification({ smiles: "" }, normalized);

    expect(merged.identification.smiles).toBe("");
    expect(merged.changed).toBe(false);
    expect(merged.skipped).toEqual([
      expect.objectContaining({ field: "smiles", reason: "unresolved_source" }),
    ]);
  });

  it("reads and writes the scoped OPSIN mapping artifact path", async () => {
    const rootDir = await makeTmpRoot();
    const adapter = createOpsinSmilesMapAdapter({ rootDir });

    await adapter.writeEntries({
      beta: null,
      alpha: "CCO",
    });

    expect(adapter.relativePath).toBe(OPSIN_MAP_RELATIVE_PATH);
    expect(adapter.artifactPath).toBe(path.join(rootDir, "data/chemistry/iupacSmilesMap.json"));
    expect(await adapter.readEntries()).toEqual({
      alpha: "CCO",
      beta: null,
    });

    const raw = await readFile(adapter.artifactPath, "utf8");
    expect(raw).toContain("\"//\"");
  });

  it("normalizes parser chemistry extracts through the module Interface", () => {
    const parsed = parseSource(
      "psychonautwiki",
      `## Chemistry
SMILES: CN
IUPAC: methanamine
Formula: CH5N
Molecular weight: 31.06`,
      "Methylamine",
    );

    const normalized = normalizeParsedChemistryIdentifiers(parsed?.chemistry);

    expect(normalized.fields).toMatchObject({
      smiles: { value: "CN", sources: ["psychonautwiki"] },
      iupac: { value: "methanamine" },
      formula: { value: "CH5N" },
      molecularWeight: { value: "31.06 g/mol" },
    });
  });
});
