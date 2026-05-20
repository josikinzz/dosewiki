import { arrayTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const toleranceFieldOverrides = defineFieldOverrides({
  "tolerance.full_tolerance": {
    label: "Full Tolerance",
    type: "text",
    required: false,
    section: "tolerance",
    placeholder: "e.g., develops immediately",
  },
  "tolerance.half_tolerance": {
    label: "Half Tolerance",
    type: "text",
    required: false,
    section: "tolerance",
    placeholder: "e.g., 5-7 days",
  },
  "tolerance.baseline_tolerance": {
    label: "Baseline Tolerance",
    type: "text",
    required: false,
    section: "tolerance",
    placeholder: "e.g., 10-14 days",
  },
  "tolerance.cross_tolerance": {
    label: "Cross-tolerance",
    type: "tagArray",
    required: false,
    section: "tolerance",
    transformer: arrayTransformer,
    description: "Other substances with shared tolerance",
  },
});
