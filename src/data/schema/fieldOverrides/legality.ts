import { arrayTransformer, countryLegalityTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const legalityFieldOverrides = defineFieldOverrides({
  "legality.international": {
    label: "International Status",
    type: "tagArray",
    required: false,
    section: "legality",
    transformer: arrayTransformer,
    description: "International scheduling (UN conventions, etc.)",
  },
  "legality.countries": {
    label: "Country-specific Status",
    type: "object",
    required: false,
    section: "legality",
    transformer: countryLegalityTransformer,
    description: "One per line: country | status | notes",
  },
});
