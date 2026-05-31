import { describe, expect, it } from "vitest";
import { z } from "zod";

import { substanceArticleSchema } from "../../src/schema/substance.schema";
import {
  extractFieldPaths,
  generateArticleDefaults,
  generateDefault,
  inferFieldRegistrySection,
  isCompoundField,
  isExpandableArrayPath,
  mapToFieldType,
} from "./schemaGenerationPolicy.ts";

describe("schema generation policy", () => {
  it("derives defaults for nullable, optional, record, array, and object fields", () => {
    const schema = z.object({
      title: z.string(),
      amount: z.number().optional(),
      notes: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      metadata: z.record(z.string(), z.string()).optional(),
      nested: z.object({ description: z.string() }).optional(),
      nullableNumber: z.number().nullable(),
      nullableObject: z.object({ value: z.string() }).nullable(),
    });

    expect(generateDefault(schema)).toEqual({
      title: "",
      amount: null,
      notes: undefined,
      aliases: [],
      metadata: {},
      nested: { description: "" },
      nullableNumber: null,
      nullableObject: null,
    });
  });

  it("applies named article compatibility defaults", () => {
    const defaults = generateArticleDefaults(substanceArticleSchema);

    expect(defaults.pharmacology).toMatchObject({
      route_bioavailability: {},
      route_half_life: {},
      route_half_life_notes: {},
      route_bioavailability_notes: {},
    });
    expect(defaults.harm_potential).toMatchObject({
      addiction: {
        psychological: { level: null, description: "" },
        physical_dependence: { level: null, description: "" },
      },
      toxicity: {
        lethal_dosage: { ld50: [], notes: "" },
        organ_toxicity: [],
        carcinogenicity: { level: null, evidence: null, description: "" },
        antibiotic_function: { level: null, description: "" },
        other: "",
      },
      psychosis: { level: null, description: "" },
      seizure: { level: null, description: "" },
    });
    expect(defaults.history_culture).toEqual({ content: "", sections: [] });
    expect(defaults.source_citations).toEqual([]);
  });

  it("keeps expandable route arrays and compound fields explicit", () => {
    const fields = extractFieldPaths(substanceArticleSchema);
    const paths = fields.map((field) => field.path);

    expect(isExpandableArrayPath("dosage.routes")).toBe(true);
    expect(isExpandableArrayPath("duration.routes")).toBe(true);
    expect(paths).toContain("dosage.routes[].dose_ranges.light");
    expect(paths).toContain("duration.routes[].stages.onset");
    expect(paths).not.toContain("dosage.routes");
    expect(paths).not.toContain("duration.routes");

    const lightDose = fields.find(
      (field) => field.path === "dosage.routes[].dose_ranges.light",
    );
    expect(lightDose).toMatchObject({
      type: "dose",
      default: null,
      isNullable: false,
      isArray: false,
    });
    expect(isCompoundField("dosage.routes[].dose_ranges.light")).toBe(true);
  });

  it("extracts current nested harm-potential fields from the article contract", () => {
    const fields = extractFieldPaths(substanceArticleSchema);
    const paths = fields.map((field) => field.path);

    expect(paths).toEqual(expect.arrayContaining([
      "harm_potential.addiction.psychological.level",
      "harm_potential.addiction.psychological.description",
      "harm_potential.addiction.physical_dependence.level",
      "harm_potential.addiction.physical_dependence.description",
      "harm_potential.toxicity.lethal_dosage.ld50",
      "harm_potential.toxicity.lethal_dosage.notes",
      "harm_potential.toxicity.organ_toxicity",
      "harm_potential.toxicity.carcinogenicity.level",
      "harm_potential.toxicity.carcinogenicity.evidence",
      "harm_potential.toxicity.carcinogenicity.description",
      "harm_potential.toxicity.antibiotic_function.level",
      "harm_potential.toxicity.antibiotic_function.description",
      "harm_potential.toxicity.other",
      "harm_potential.psychosis.level",
      "harm_potential.psychosis.description",
      "harm_potential.seizure.level",
      "harm_potential.seizure.description",
    ]));
    expect(paths).toEqual(expect.not.arrayContaining([
      "harm_potential.addiction_liability",
      "harm_potential.dependence_liability",
      "harm_potential.toxicity.ld50",
      "harm_potential.risks.psychosis",
      "harm_potential.risks.seizure",
      "harm_potential.risks.other",
    ]));
  });

  it("registers non-expandable arrays, records, nullable objects, and section shards", () => {
    const fields = extractFieldPaths(substanceArticleSchema);

    expect(fields.find((field) => field.path === "citations")).toMatchObject({
      type: "citation",
      default: [],
      isArray: true,
    });
    expect(fields.find((field) => field.path === "references")).toMatchObject({
      type: "reference",
      default: [],
      isArray: true,
    });
    expect(fields.find((field) => field.path === "dosage.routes[].reference_ids")).toMatchObject({
      type: "array",
      default: [],
      isArray: true,
    });
    expect(fields.find((field) => field.path === "reagent_testing")).toMatchObject({
      type: "object",
      default: {},
      isArray: false,
    });
    expect(fields.find((field) => field.path === "dosage.plateau_dosing")).toMatchObject({
      type: "object",
      default: null,
      isNullable: true,
    });

    expect(inferFieldRegistrySection("reagent_testing")).toBe("identification");
    expect(inferFieldRegistrySection("references")).toBe("citations");
    expect(inferFieldRegistrySection("source_citations")).toBe("citations");
    expect(inferFieldRegistrySection("history_culture.content")).toBe("meta");
  });

  it("maps field types for generated registry controls", () => {
    const schema = z.object({
      tags: z.array(z.string()),
      valuesByRoute: z.record(z.string(), z.number()),
      nullableNumber: z.number().nullable(),
      nullableObject: z.object({ value: z.string() }).nullable(),
    });
    const shape = schema.shape;

    expect(mapToFieldType(shape.tags, "tags")).toBe("tagArray");
    expect(mapToFieldType(shape.valuesByRoute, "valuesByRoute")).toBe("object");
    expect(mapToFieldType(shape.nullableNumber, "nullableNumber")).toBe("number");
    expect(mapToFieldType(shape.nullableObject, "nullableObject")).toBe("object");
    expect(mapToFieldType(shape.tags, "citations")).toBe("citation");
    expect(mapToFieldType(shape.tags, "references")).toBe("reference");
    expect(mapToFieldType(shape.tags, "dosage.routes[].reference_ids")).toBe("array");
  });
});
