import { arrayTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const pharmacologyFieldOverrides = defineFieldOverrides({
  "pharmacology.pharmacodynamics": {
    label: "Pharmacodynamics",
    type: "textarea",
    required: false,
    section: "pharmacology",
    description: "Plain-language pharmacodynamics overview",
  },
  "pharmacology.receptor_profile": {
    label: "Receptor Affinities",
    type: "object",
    required: false,
    section: "pharmacology",
    description: "Combined mechanism of action and receptor binding data",
  },
  "pharmacology.pharmacokinetics": {
    label: "Pharmacokinetics",
    type: "textarea",
    required: false,
    section: "pharmacology",
  },
  "pharmacology.metabolites": {
    label: "Metabolites",
    type: "tagArray",
    required: false,
    section: "pharmacology",
    transformer: arrayTransformer,
  },
});
