import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema";
import { buildEditorReferenceDiagnostics } from "./editorReferenceDiagnostics";

describe("buildEditorReferenceDiagnostics", () => {
  it("surfaces inline token, route linkage, and orphaned-reference diagnostics", () => {
    const article = createEmptyArticle();
    article.summary = "Primary claim [cite:ref-a][cite:ref-a] and missing [cite:missing-ref].";
    article.references = [
      { id: "ref-a", type: "webpage", title: "Reference A", authors: [], sourceType: "unknown", quality: "fallback" },
      { id: "unused-ref", type: "webpage", title: "Unused", authors: [], sourceType: "unknown", quality: "fallback" },
    ];
    article.dosage.routes = [
      {
        route: "Oral",
        bioavailability: "",
        bioavailability_notes: "",
        dose_ranges: {
          threshold: { min: null, max: null, unit: "" },
          light: { min: null, max: null, unit: "" },
          moderate: { min: null, max: null, unit: "" },
          strong: { min: null, max: null, unit: "" },
          heavy: { min: null, max: null, unit: "" },
        },
        notes: "",
        reference_ids: ["ref-a", "route-missing"],
      },
    ];
    article.duration.routes = [
      {
        route: "Oral",
        half_life: "",
        half_life_notes: "",
        stages: {
          onset: { min: null, max: null, unit: "" },
          come_up: { min: null, max: null, unit: "" },
          peak: { min: null, max: null, unit: "" },
          offset: { min: null, max: null, unit: "" },
          after_effects: { min: null, max: null, unit: "" },
          total_duration: { min: null, max: null, unit: "" },
        },
        reference_ids: [],
      },
    ];

    const diagnostics = buildEditorReferenceDiagnostics(article);

    expect(diagnostics.unknownInlineReferenceIds).toEqual(["missing-ref"]);
    expect(diagnostics.unknownStructuredReferenceIds).toEqual(["route-missing"]);
    expect(diagnostics.duplicateAdjacentTokenIds).toEqual(["ref-a"]);
    expect(diagnostics.orphanedReferenceIds).toEqual(["unused-ref"]);
    expect(diagnostics.routePreviews[0]).toMatchObject({
      routeLabel: "Oral",
      hasMultipleReferences: true,
      renderedLabels: ["[1] ref-a", "[?] route-missing"],
    });
    expect(diagnostics.prosePreviews[0]?.renderedText).toContain("[1][1]");
  });
});
