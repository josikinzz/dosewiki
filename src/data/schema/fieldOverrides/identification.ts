import { arrayTransformer, recordTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const identificationFieldOverrides = defineFieldOverrides({
  "identification.common_name": {
    label: "Common Name",
    type: "text",
    required: true,
    section: "identification",
    placeholder: "e.g., LSD, MDMA, Psilocybin",
  },
  "identification.substitutive_name": {
    label: "Substitutive Name",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., Lysergic acid diethylamide",
  },
  "identification.iupac_name": {
    label: "IUPAC Name",
    type: "text",
    required: false,
    section: "identification",
  },
  "identification.alternative_names": {
    label: "Alternative Names",
    type: "tagArray",
    required: false,
    section: "identification",
    transformer: arrayTransformer,
    placeholder: "Acid, Lucy, Tabs",
  },
  "identification.smiles": {
    label: "SMILES",
    type: "text",
    required: false,
    section: "identification",
    description: "Simplified molecular input line entry system notation",
  },
  "identification.inchi_key": {
    label: "InChI Key",
    type: "text",
    required: false,
    section: "identification",
  },
  "identification.cas_number": {
    label: "CAS Number",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., 50-37-3",
  },
  "identification.molecular_formula": {
    label: "Molecular Formula",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., C20H25N3O",
  },
  "identification.molecular_weight": {
    label: "Molecular Weight",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., 323.43 g/mol",
  },
  "identification.skeletal_structure_image": {
    label: "Structure Image Path",
    type: "text",
    required: false,
    section: "identification",
  },
  reagent_testing: {
    label: "Reagent Testing",
    type: "object",
    required: false,
    section: "identification",
    transformer: recordTransformer,
    description: "One per line: reagent: color reaction",
  },
});
