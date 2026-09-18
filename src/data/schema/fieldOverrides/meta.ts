import { arrayTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const metaFieldOverrides = defineFieldOverrides({
  id: {
    label: "ID",
    type: "number",
    required: false,
    section: "meta",
    description: "Unique numeric identifier (auto-generated)",
  },
  title: {
    label: "Title",
    type: "text",
    required: false,
    section: "meta",
    description: "Article title (usually same as common name)",
  },
  index_categories: {
    label: "Index Categories",
    type: "tagArray",
    required: false,
    section: "meta",
    transformer: arrayTransformer,
    description: "Categories for indexing (e.g., Psychedelic, Stimulant, Hidden)",
  },
  summary: {
    label: "Summary",
    type: "textarea",
    required: false,
    section: "meta",
    description: "Brief summary of the substance",
  },
});
