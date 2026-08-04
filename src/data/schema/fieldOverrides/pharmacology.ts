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
  "pharmacology.binding_sites": {
    label: "Binding Sites",
    type: "object",
    required: false,
    section: "pharmacology",
    description: "Pharmacological targets, mechanisms, binding data, and efficacy notes",
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
