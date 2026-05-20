import { describe, expect, it } from "vitest";

import { GENERATED_FIELD_REGISTRY } from "./fieldRegistry.generated";
import { FIELD_OVERRIDES } from "./fieldOverrides";
import {
  FIELD_REGISTRY,
  OVERRIDE_ONLY_FIELD_PATHS,
  REGISTRY_COMPOSITION,
  ROUTE_DEPENDENT_FIELDS,
  ROUTE_DEPENDENT_SECTIONS,
  SECTION_FIELD_GROUPS,
  SECTION_FIELDS_MISSING_FROM_REGISTRY,
  SECTION_REGISTRY,
  UNMATCHED_GENERATED_FIELD_PATHS,
  composeRegistry,
} from "./registryComposition";
import type { SectionMeta } from "./types";

describe("registry composition", () => {
  it("preserves public field and section order through the composed registry", () => {
    expect(Object.keys(FIELD_REGISTRY)).toEqual([
      ...Object.keys(GENERATED_FIELD_REGISTRY),
      ...Object.keys(FIELD_OVERRIDES).filter((path) => !(path in GENERATED_FIELD_REGISTRY)),
    ]);
    expect(SECTION_REGISTRY.map((section) => section.key)).toEqual([
      "meta",
      "identification",
      "classification",
      "dosage",
      "duration",
      "subjective_effects",
      "pharmacology",
      "interactions",
      "tolerance",
      "harm_potential",
      "legality",
      "citations",
    ]);
    expect(SECTION_REGISTRY.find((section) => section.key === "citations")?.fields).toEqual([
      "references",
      "source_citations",
      "citations",
    ]);
    expect(SECTION_FIELD_GROUPS.find(({ section }) => section.key === "dosage")?.fields.map((field) => field.path)).toEqual(
      SECTION_REGISTRY.find((section) => section.key === "dosage")?.fields
    );
  });

  it("exposes route-dependent fields and sections from one composed catalog", () => {
    expect(ROUTE_DEPENDENT_FIELDS.map((field) => field.path)).toContain("dosage.routes[].dose_ranges.light");
    expect(ROUTE_DEPENDENT_FIELDS.map((field) => field.path)).toContain("duration.routes[].stages.onset");
    expect(ROUTE_DEPENDENT_FIELDS.map((field) => field.path)).toContain("dosage.routes[].reference_ids");
    expect(ROUTE_DEPENDENT_FIELDS.map((field) => field.path)).toContain("duration.routes[].reference_ids");
    expect(ROUTE_DEPENDENT_SECTIONS.map((section) => section.key)).toEqual(["dosage", "duration"]);
  });

  it("surfaces non-enforcing diagnostics for generated, override, and section relationships", () => {
    expect(REGISTRY_COMPOSITION.diagnostics).toMatchObject({
      unmatchedGeneratedPaths: UNMATCHED_GENERATED_FIELD_PATHS,
      overrideOnlyPaths: OVERRIDE_ONLY_FIELD_PATHS,
      sectionFieldsMissingFromRegistry: SECTION_FIELDS_MISSING_FROM_REGISTRY,
    });
    expect(REGISTRY_COMPOSITION.diagnostics.fieldPathDiagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(
      true
    );
    expect(SECTION_FIELDS_MISSING_FROM_REGISTRY).toEqual([]);
    expect(UNMATCHED_GENERATED_FIELD_PATHS).not.toContain("references");
    expect(UNMATCHED_GENERATED_FIELD_PATHS).not.toContain("dosage.routes[].reference_ids");
    expect(UNMATCHED_GENERATED_FIELD_PATHS).not.toContain("duration.routes[].reference_ids");
  });

  it("reports override-only and section-only paths without dropping generated fields", () => {
    const sectionRegistry: SectionMeta[] = [
      {
        key: "meta",
        label: "Meta",
        icon: "lucide:settings",
        fields: ["title", "missing.section_field"],
      },
    ];
    const composition = composeRegistry(
      {
        title: { path: "title", type: "text", default: "", isNullable: false },
        "summary.content": { path: "summary.content", type: "textarea", default: "", isNullable: false },
      },
      {
        "legacy.compatibility": { label: "Legacy Compatibility", section: "meta" },
      },
      sectionRegistry
    );

    expect(composition.fieldRegistry["summary.content"]?.label).toBe("Content");
    expect(composition.overrideOnlyPaths).toEqual(["legacy.compatibility"]);
    expect(composition.sectionFieldsMissingFromRegistry).toEqual([{ section: "meta", path: "missing.section_field" }]);
    expect(composition.unmatchedGeneratedPaths).toEqual(["summary.content"]);
    expect(composition.diagnostics.fieldPathDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "section",
          path: "missing.section_field",
          severity: "warning",
        }),
        expect.objectContaining({
          operation: "override",
          path: "legacy.compatibility",
          severity: "warning",
        }),
      ])
    );
  });
});
