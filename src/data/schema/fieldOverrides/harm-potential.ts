import { defineFieldOverrides } from "./shared";

export const harmPotentialFieldOverrides = defineFieldOverrides({
  "harm_potential.addiction.psychological.level": {
    label: "Psychological Addiction Level",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.addiction.psychological.description": {
    label: "Psychological Addiction Description",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.addiction.physical_dependence.level": {
    label: "Physical Dependence Level",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.addiction.physical_dependence.description": {
    label: "Physical Dependence Description",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.lethal_dosage.ld50": {
    label: "LD50",
    type: "array",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.lethal_dosage.notes": {
    label: "Lethal Dosage Notes",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.organ_toxicity": {
    label: "Organ Toxicity",
    type: "array",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.carcinogenicity.level": {
    label: "Carcinogenicity Level",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.carcinogenicity.evidence": {
    label: "Carcinogenicity Evidence",
    type: "object",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.carcinogenicity.description": {
    label: "Carcinogenicity Description",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.antibiotic_function.level": {
    label: "Antibiotic Function Level",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.antibiotic_function.description": {
    label: "Antibiotic Function Description",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.other": {
    label: "Other Toxicity",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.psychosis.level": {
    label: "Psychosis Risk Level",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.psychosis.description": {
    label: "Psychosis Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.seizure.level": {
    label: "Seizure Risk Level",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.seizure.description": {
    label: "Seizure Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
});
