import type { SubstanceArticleProjectionInput } from "@/schema";
import { formatMessage, msg } from "@/i18n/messages";

import { cleanString, cleanStringArray } from "./contentBuilderShared";

/**
 * Molecule image alt text. The builder prints the English form in
 * `molecule.alt`; a renderer with a locale passes these to `t` with the
 * `lookupTitle` instead.
 */
export const MOLECULE_ALT_MESSAGE = msg("{{title}} molecule structure");
export const MOLECULE_ALT_FALLBACK_MESSAGE = msg("Molecule structure");

type ChemistryIdentifierKey = | "iupac_name"
| "cas_number"
| "molecular_formula"
| "molecular_weight"
| "smiles"
| "inchi_key"

interface ChemistryIdentifier { key: ChemistryIdentifierKey;
label: string;
value: string;
format: "text" | "formula" | "code"; }

interface MoleculePresentation { lookupTitle: string;
alt: string;
hasLookupTitle: boolean; }

interface ReagentTestingPresentation { staticEntries: [string, string][];
lookupName: string;
aliases: string[];
hasStaticData: boolean;
shouldFetchApiData: boolean; }

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
  { key: "iupac_name", label: msg("IUPAC"), format: "code" },
  { key: "cas_number", label: msg("CAS"), format: "text" },
  { key: "molecular_formula", label: msg("Formula"), format: "formula" },
  { key: "molecular_weight", label: msg("Molecular Weight"), format: "text" },
  { key: "smiles", label: msg("SMILES"), format: "code" },
  { key: "inchi_key", label: msg("InChI Key"), format: "code" },
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
      alt: moleculeTitle
        ? formatMessage(MOLECULE_ALT_MESSAGE, { title: moleculeTitle })
        : MOLECULE_ALT_FALLBACK_MESSAGE,
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
