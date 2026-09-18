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
          threshold: null,
          light: null,
          moderate: null,
          strong: null,
          heavy: null,
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
          onset: null,
          come_up: null,
          peak: null,
          offset: null,
          after_effects: null,
          total_duration: null,
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
