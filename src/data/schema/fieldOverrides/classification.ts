import { arrayTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const classificationFieldOverrides = defineFieldOverrides({
  "classification.psychoactive_class": {
    label: "Psychoactive Class",
    type: "tagArray",
    required: false,
    section: "classification",
    transformer: arrayTransformer,
    placeholder: "Psychedelic, Stimulant, Depressant",
  },
  "classification.chemical_class": {
    label: "Chemical Class",
    type: "tagArray",
    required: false,
    section: "classification",
    transformer: arrayTransformer,
    placeholder: "Lysergamide, Phenethylamine, Tryptamine",
  },
});
