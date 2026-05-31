import type { SubstanceArticleProjectionInput } from "@/schema";

import { cleanString, cleanStringArray } from "./contentBuilderShared";

export type ChemistryIdentifierKey =
  | "iupac_name"
  | "cas_number"
  | "molecular_formula"
  | "molecular_weight"
  | "smiles"
  | "inchi_key";

export interface ChemistryIdentifier {
  key: ChemistryIdentifierKey;
  label: string;
  value: string;
  format: "text" | "formula" | "code";
}

export interface MoleculePresentation {
  lookupTitle: string;
  alt: string;
  hasLookupTitle: boolean;
}

export interface ReagentTestingPresentation {
  staticEntries: [string, string][];
  lookupName: string;
  aliases: string[];
  hasStaticData: boolean;
  shouldFetchApiData: boolean;
}

export interface ArticleChemistryPresentation {
  identifiers: ChemistryIdentifier[];
  hasIdentifiers: boolean;
  molecule: MoleculePresentation;
  reagentTesting: ReagentTestingPresentation;
  editorGroups: {
    chemistry: string;
    pharmacology: string;
    reagentTesting: string;
  };
}

const CHEMISTRY_IDENTIFIER_FIELDS: Array<{
  key: ChemistryIdentifierKey;
  label: string;
  format: ChemistryIdentifier["format"];
}> = [
  { key: "iupac_name", label: "IUPAC", format: "code" },
  { key: "cas_number", label: "CAS", format: "text" },
  { key: "molecular_formula", label: "Formula", format: "formula" },
  { key: "molecular_weight", label: "Molecular Weight", format: "text" },
  { key: "smiles", label: "SMILES", format: "code" },
  { key: "inchi_key", label: "InChI Key", format: "code" },
];

function buildChemistryIdentifiers(article: SubstanceArticleProjectionInput): ChemistryIdentifier[] {
  const identification = article.identification;

  return CHEMISTRY_IDENTIFIER_FIELDS.reduce<ChemistryIdentifier[]>((identifiers, field) => {
    const rawValue = identification?.[field.key];
    const value = cleanString(rawValue);
    if (!value) {
      return identifiers;
    }

    identifiers.push({
      ...field,
      value: field.key === "molecular_weight" ? value.replace(/^Average:/, "").trim() : value,
    });
    return identifiers;
  }, []);
}

function buildReagentTestingPresentation(article: SubstanceArticleProjectionInput): ReagentTestingPresentation {
  const staticEntries = Object.entries(article.reagent_testing ?? {}).filter(
    ([, value]) => Boolean(cleanString(value)),
  );
  const lookupName = cleanString(article.identification?.common_name) ?? cleanString(article.title) ?? "";
  const aliases = cleanStringArray(article.identification?.alternative_names);
  const hasStaticData = staticEntries.length > 0;

  return {
    staticEntries,
    lookupName,
    aliases,
    hasStaticData,
    shouldFetchApiData: !hasStaticData && lookupName.length > 0,
  };
}

export function buildArticleChemistryPresentation(
  article: SubstanceArticleProjectionInput,
): ArticleChemistryPresentation {
  const identifiers = buildChemistryIdentifiers(article);
  const moleculeTitle = cleanString(article.title) ?? "";

  return {
    identifiers,
    hasIdentifiers: identifiers.length > 0,
    molecule: {
      lookupTitle: moleculeTitle,
      alt: moleculeTitle ? `${moleculeTitle} molecule structure` : "Molecule structure",
      hasLookupTitle: moleculeTitle.length > 0,
    },
    reagentTesting: buildReagentTestingPresentation(article),
    editorGroups: {
      chemistry: "Chemical Identification",
      pharmacology: "Pharmacology",
      reagentTesting: "Reagent Testing",
    },
  };
}
