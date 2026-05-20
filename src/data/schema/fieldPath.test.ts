import { describe, expect, it } from "vitest";

import {
  getFieldRegistryDiagnostics,
  getSectionRegistryDiagnostics,
} from "./index";

import {
  getArticleValueByPath,
  isFieldPathDiagnostic,
  isIndexedFieldPath,
  isTemplateFieldPath,
  parseFieldPath,
  routeTemplatePathToConcretePath,
  routeTemplatePathToRouteRelativePath,
  setArticleValueByPath,
  validateFieldPath,
} from "./fieldPath";

describe("fieldPath", () => {
  it("parses nested, template, and indexed paths", () => {
    expect(parseFieldPath("identification.common_name")).toMatchObject({
      normalized: "identification.common_name",
      isTemplate: false,
      isIndexed: false,
    });

    expect(parseFieldPath("dosage.routes[].dose_ranges.light")).toMatchObject({
      normalized: "dosage.routes[].dose_ranges.light",
      isTemplate: true,
      isIndexed: false,
    });

    expect(parseFieldPath("dosage.routes[0].route")).toMatchObject({
      normalized: "dosage.routes[0].route",
      isTemplate: false,
      isIndexed: true,
    });

    expect(isTemplateFieldPath("duration.routes[].stages.onset")).toBe(true);
    expect(isIndexedFieldPath("duration.routes[12].stages.onset")).toBe(true);
  });

  it("reports invalid syntax instead of normalizing ambiguous paths", () => {
    const empty = parseFieldPath("");
    const malformed = parseFieldPath("dosage..route");
    const invalidIndex = parseFieldPath("dosage.routes[-1].route");

    expect(isFieldPathDiagnostic(empty)).toBe(true);
    expect(isFieldPathDiagnostic(malformed)).toBe(true);
    expect(isFieldPathDiagnostic(invalidIndex)).toBe(true);
  });

  it("converts route template paths to concrete and route-relative paths", () => {
    expect(routeTemplatePathToConcretePath("dosage.routes[].dose_ranges.light", 2)).toBe(
      "dosage.routes[2].dose_ranges.light"
    );
    expect(routeTemplatePathToRouteRelativePath("duration.routes[].stages.onset")).toBe("stages.onset");
  });

  it("gets and sets article values without mutating the source article", () => {
    const article = {
      identification: { common_name: "Old" },
      dosage: { routes: [{ route: "Oral", dose_ranges: { light: { min: 1 } } }] },
    };

    const updated = setArticleValueByPath(article, "dosage.routes[0].dose_ranges.light.max", 3);

    expect(getArticleValueByPath(updated, "dosage.routes[0].dose_ranges.light.max")).toBe(3);
    expect(getArticleValueByPath(article, "dosage.routes[0].dose_ranges.light.max")).toBeUndefined();
  });

  it("does not write template or invalid paths into article data", () => {
    const article = { dosage: { routes: [{ route: "Oral" }] } };

    expect(setArticleValueByPath(article, "dosage.routes[].route", "IV")).toBe(article);
    expect(setArticleValueByPath(article, "dosage..route", "IV")).toBe(article);
  });

  it("validates operation-specific registry, override, and section path rules", () => {
    const knownPaths = new Set(["title", "dosage.routes[].route"]);

    expect(validateFieldPath("dosage.routes[0].route", { operation: "registry", knownRegistryPaths: knownPaths })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "indexed_not_allowed" })])
    );

    expect(
      validateFieldPath("legacy.override_only", {
        operation: "override",
        knownRegistryPaths: knownPaths,
        allowUnknownOverridePaths: true,
      })
    ).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "warning" })]));

    expect(validateFieldPath("missing.path", { operation: "section", knownRegistryPaths: knownPaths })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unknown_section_path", severity: "warning" })])
    );

    expect(validateFieldPath("dosage.routes[].route", { operation: "write" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "template_not_allowed" })])
    );
  });

  it("exposes diagnostics for the current registry and section path inventories", () => {
    expect(getFieldRegistryDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "subjective_effects.sensory.visual",
          operation: "override",
          severity: "warning",
        }),
      ])
    );
    expect(getSectionRegistryDiagnostics()).toEqual([]);
  });
});
