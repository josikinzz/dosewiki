import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema/defaults.generated";

import { buildArticleChemistryPresentation } from "./articleChemistryPresentation";

describe("buildArticleChemistryPresentation", () => {
  it("builds chemistry identifiers and normalizes display-only molecular weight text", () => {
    const article = createEmptyArticle();
    article.title = "LSD";
    article.identification.iupac_name = "IUPAC value";
    article.identification.cas_number = "50-37-3";
    article.identification.molecular_formula = "C20H25N3O";
    article.identification.molecular_weight = "Average: 323.43 g/mol";
    article.identification.smiles = "CCN(CC)";
    article.identification.inchi_key = "VYFYYTLLBUKUHU";

    const presentation = buildArticleChemistryPresentation(article);

    expect(presentation.hasIdentifiers).toBe(true);
    expect(presentation.identifiers).toEqual([
      expect.objectContaining({ key: "iupac_name", label: "IUPAC", value: "IUPAC value", format: "code" }),
      expect.objectContaining({ key: "cas_number", label: "CAS", value: "50-37-3", format: "text" }),
      expect.objectContaining({ key: "molecular_formula", label: "Formula", value: "C20H25N3O", format: "formula" }),
      expect.objectContaining({ key: "molecular_weight", label: "Molecular Weight", value: "323.43 g/mol", format: "text" }),
      expect.objectContaining({ key: "smiles", label: "SMILES", value: "CCN(CC)", format: "code" }),
      expect.objectContaining({ key: "inchi_key", label: "InChI Key", value: "VYFYYTLLBUKUHU", format: "code" }),
    ]);
  });

  it("reports missing identifiers and molecule lookup availability", () => {
    const article = createEmptyArticle();

    const presentation = buildArticleChemistryPresentation(article);

    expect(presentation.hasIdentifiers).toBe(false);
    expect(presentation.identifiers).toEqual([]);
    expect(presentation.molecule).toMatchObject({
      lookupTitle: "",
      hasLookupTitle: false,
      alt: "Molecule structure",
    });
  });

  it("uses static reagent data before API lookup data", () => {
    const article = createEmptyArticle();
    article.title = "MDMA";
    article.identification.common_name = "MDMA";
    article.identification.alternative_names = ["Molly", "Ecstasy"];
    article.reagent_testing = {
      marquis: "purple to black",
      mecke: "",
    };

    const presentation = buildArticleChemistryPresentation(article);

    expect(presentation.reagentTesting).toEqual({
      staticEntries: [["marquis", "purple to black"]],
      lookupName: "MDMA",
      aliases: ["Molly", "Ecstasy"],
      hasStaticData: true,
      shouldFetchApiData: false,
    });
  });

  it("marks reagent testing API lookup eligible when static data is missing", () => {
    const article = createEmptyArticle();
    article.title = "Ketamine";

    const presentation = buildArticleChemistryPresentation(article);

    expect(presentation.reagentTesting).toMatchObject({
      staticEntries: [],
      lookupName: "Ketamine",
      hasStaticData: false,
      shouldFetchApiData: true,
    });
  });
});
