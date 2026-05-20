import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldMeta } from "@/data/schema";
import {
  arrayTransformer,
  doseRangeTransformer,
  durationStageTransformer,
  recordTransformer,
} from "@/data/schema/transformers";
import { FIELD_ADAPTERS, getFieldAdapter } from "./adapters";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

const baseMeta: FieldMeta = {
  path: "test.field",
  label: "Test Field",
  type: "text",
  required: false,
  default: "",
  section: "meta",
};

function meta(overrides: Partial<FieldMeta>): FieldMeta {
  return {
    ...baseMeta,
    ...overrides,
  };
}

function expectDisabledControl(label: string, fallbackPlaceholder?: string) {
  const control = fallbackPlaceholder
    ? screen.getByPlaceholderText(fallbackPlaceholder)
    : screen.getByLabelText(label);

  expect(control).toBeDisabled();
}

describe("field Adapters", () => {
  it.each([
    {
      type: "text",
      meta: meta({ type: "text" }),
      value: "LSD",
      displayValue: "LSD",
      nextDisplayValue: "MDMA",
      schemaValue: "MDMA",
    },
    {
      type: "textarea",
      meta: meta({ type: "textarea" }),
      value: "Line one",
      displayValue: "Line one",
      nextDisplayValue: "Line two",
      schemaValue: "Line two",
    },
    {
      type: "number",
      meta: meta({ type: "number" }),
      value: 12,
      displayValue: "12",
      nextDisplayValue: "13",
      schemaValue: "13",
    },
    {
      type: "array",
      meta: meta({ type: "array", transformer: arrayTransformer }),
      value: ["one", "two"],
      displayValue: ["one", "two"],
      nextDisplayValue: ["three"],
      schemaValue: ["three"],
    },
    {
      type: "tagArray",
      meta: meta({ type: "tagArray", transformer: arrayTransformer }),
      value: ["one", "two"],
      displayValue: ["one", "two"],
      nextDisplayValue: ["three"],
      schemaValue: ["three"],
    },
    {
      type: "dose",
      meta: meta({ type: "dose", transformer: doseRangeTransformer }),
      value: { min: 10, max: 20, unit: "mg" },
      displayValue: "10-20 mg",
      nextDisplayValue: "30+ mg",
      schemaValue: { min: 30, max: null, unit: "mg" },
    },
    {
      type: "duration",
      meta: meta({ type: "duration", transformer: durationStageTransformer }),
      value: { min: 15, max: 30, unit: "minutes" },
      displayValue: "15-30 minutes",
      nextDisplayValue: "<2 hours",
      schemaValue: { min: null, max: 2, unit: "hours" },
    },
    {
      type: "citation",
      meta: meta({ type: "citation" }),
      value: [{ name: "Source", url: "https://example.com" }],
      displayValue: [{ name: "Source", url: "https://example.com" }],
      nextDisplayValue: [{ name: "Other", url: "https://example.org" }],
      schemaValue: [{ name: "Other", url: "https://example.org" }],
    },
    {
      type: "reference",
      meta: meta({ type: "reference" }),
      value: [{ id: "ref-a", type: "webpage", title: "Source", authors: [], sourceType: "unknown", quality: "fallback" }],
      displayValue: [{ id: "ref-a", type: "webpage", title: "Source", authors: [], sourceType: "unknown", quality: "fallback" }],
      nextDisplayValue: [{ id: "ref-b", type: "report", title: "Other", authors: ["A"], sourceType: "news_media", quality: "low" }],
      schemaValue: [{ id: "ref-b", type: "report", title: "Other", authors: ["A"], sourceType: "news_media", quality: "low" }],
    },
    {
      type: "object",
      meta: meta({ type: "object", transformer: recordTransformer }),
      value: { Marquis: "purple" },
      displayValue: "Marquis: purple",
      nextDisplayValue: "Mecke: green",
      schemaValue: { Mecke: "green" },
    },
  ] as const)(
    "converts display and schema values for $type fields",
    ({ type, meta, value, displayValue, nextDisplayValue, schemaValue }) => {
      const adapter = FIELD_ADAPTERS[type];

      expect(adapter.type).toBe(type);
      expect(adapter.toDisplayValue(meta, value)).toEqual(displayValue);
      expect(adapter.toSchemaValue(meta, nextDisplayValue)).toEqual({
        valid: true,
        value: schemaValue,
      });
    }
  );

  it.each([
    { type: "text", control: "Test Field" },
    { type: "textarea", control: "Test Field" },
    { type: "number", control: "Test Field" },
    { type: "array", control: "Test Field" },
    { type: "tagArray", control: "Test Field" },
    { type: "dose", control: "Test Field" },
    { type: "duration", control: "Test Field" },
    { type: "object", control: "Test Field" },
    { type: "citation", control: "Test Field", placeholder: "New citation name" },
    { type: "reference", control: "Test Field", placeholder: "Stable ID" },
  ] as const)("passes disabled state through $type rendering", ({ type, control, placeholder }) => {
    const fieldMeta = meta({ type });
    const adapter = FIELD_ADAPTERS[type];

    render(
      adapter.render({
        meta: fieldMeta,
        value: adapter.toDisplayValue(fieldMeta, []),
        onChange: vi.fn(),
        disabled: true,
      })
    );

    expectDisabledControl(control, placeholder);
  });

  it("keeps object JSON parsing explicit for invalid drafts", () => {
    const fieldMeta = meta({ type: "object" });
    const adapter = FIELD_ADAPTERS.object;

    expect(adapter.toDisplayValue(fieldMeta, { one: 1 })).toBe(
      JSON.stringify({ one: 1 }, null, 2)
    );
    expect(adapter.toSchemaValue(fieldMeta, "{\"one\":2}")).toEqual({
      valid: true,
      value: { one: 2 },
    });
    expect(adapter.toSchemaValue(fieldMeta, "{")).toEqual({
      valid: false,
      error: "Invalid JSON. Fix the draft before saving this field.",
    });
    expect(adapter.validateDraft?.(fieldMeta, "{")).toBe(
      "Invalid JSON. Fix the draft before saving this field."
    );
  });

  it("returns the fallback Adapter for unknown field types", () => {
    expect(getFieldAdapter("custom-field").type).toBe("fallback");
  });
});
