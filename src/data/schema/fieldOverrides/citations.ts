import { defineFieldOverrides } from "./shared";

export const citationsFieldOverrides = defineFieldOverrides({
  references: {
    label: "Structured References",
    type: "reference",
    required: false,
    section: "citations",
    description: "Primary citation catalog used by inline [cite:id] tokens and route reference_ids.",
  },
  source_citations: {
    label: "Legacy Primary Source Links",
    type: "citation",
    required: false,
    section: "citations",
    description: "Compatibility/fallback source links retained for migration and import/export workflows.",
  },
  citations: {
    label: "Legacy Further Reading Links",
    type: "citation",
    required: false,
    section: "citations",
    description: "Compatibility/fallback uncited resources retained outside the numbered references model.",
  },
});
