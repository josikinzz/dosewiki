import { arrayTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const interactionsFieldOverrides = defineFieldOverrides({
  "interactions.dangerous": {
    label: "Dangerous Interactions",
    type: "tagArray",
    required: false,
    section: "interactions",
    transformer: arrayTransformer,
    description: "Life-threatening combinations",
  },
  "interactions.unsafe": {
    label: "Unsafe Interactions",
    type: "tagArray",
    required: false,
    section: "interactions",
    transformer: arrayTransformer,
    description: "Significantly risky combinations",
  },
  "interactions.caution": {
    label: "Caution Interactions",
    type: "tagArray",
    required: false,
    section: "interactions",
    transformer: arrayTransformer,
    description: "Exercise caution with these combinations",
  },
});
