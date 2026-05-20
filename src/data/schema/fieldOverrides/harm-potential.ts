import { arrayTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const harmPotentialFieldOverrides = defineFieldOverrides({
  "harm_potential.addiction_liability": {
    label: "Addiction Liability",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.dependence_liability": {
    label: "Dependence Liability",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.ld50": {
    label: "LD50",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.organ_toxicity": {
    label: "Organ Toxicity",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.carcinogenicity": {
    label: "Carcinogenicity",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.other": {
    label: "Other Toxicity",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.psychosis": {
    label: "Psychosis Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.self_harm": {
    label: "Self-harm Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.seizure": {
    label: "Seizure Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.other": {
    label: "Other Risks",
    type: "tagArray",
    required: false,
    section: "harm_potential",
    transformer: arrayTransformer,
  },
});
