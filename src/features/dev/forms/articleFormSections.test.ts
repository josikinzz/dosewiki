import { describe, expect, it } from "vitest";
import type { FieldErrors } from "react-hook-form";
import type { SubstanceArticle } from "@/schema";

import {
  describeInvalidFields,
  describeInvalidSections,
  formatInvalidSectionsMessage,
} from "./articleFormSections";

describe("describeInvalidSections", () => {
  it("maps top-level schema keys onto the section card titles", () => {
    const errors = {
      dosage: { message: "Required" },
      references: { message: "Required" },
    } as unknown as FieldErrors<SubstanceArticle>;

    expect(describeInvalidSections(errors)).toEqual(["Dosage & Duration", "References"]);
  });

  it("collapses dosage and duration onto one section label", () => {
    const errors = {
      dosage: { message: "Required" },
      duration: { message: "Required" },
    } as unknown as FieldErrors<SubstanceArticle>;

    expect(describeInvalidSections(errors)).toEqual(["Dosage & Duration"]);
  });

  it("falls back to a readable key for unmapped paths", () => {
    const errors = { made_up_key: { message: "Required" } } as unknown as FieldErrors<SubstanceArticle>;

    expect(describeInvalidSections(errors)).toEqual(["made up key"]);
  });
});

describe("describeInvalidFields", () => {
  it("preserves nested field paths and resolver messages", () => {
    const errors = {
      subjective_effects: {
        attribution: {
          author: { message: "Expected a text value" },
          url: { message: "Expected a text value" },
        },
      },
    } as unknown as FieldErrors<SubstanceArticle>;

    expect(describeInvalidFields(errors)).toEqual([
      {
        path: "subjective_effects.attribution.author",
        label: "Subjective Effects \u203a Attribution \u203a Author",
        message: "Expected a text value",
      },
      {
        path: "subjective_effects.attribution.url",
        label: "Subjective Effects \u203a Attribution \u203a URL",
        message: "Expected a text value",
      },
    ]);
  });
});

describe("formatInvalidSectionsMessage", () => {
  it("names a single failing section", () => {
    expect(formatInvalidSectionsMessage(["Overview"])).toContain("Overview");
  });

  it("joins several failing sections", () => {
    expect(formatInvalidSectionsMessage(["Overview", "Legality", "References"])).toBe(
      "Fix the highlighted fields in Overview, Legality and References before applying this draft.",
    );
  });

  it("includes actionable field details", () => {
    expect(
      formatInvalidSectionsMessage(
        ["Subjective Effects"],
        [{
          path: "subjective_effects.attribution.author",
          label: "Subjective Effects \u203a Attribution \u203a Author",
          message: "Expected a text value",
        }],
      ),
    ).toBe(
      "Fix the highlighted fields in Subjective Effects before applying this draft. Subjective Effects \u203a Attribution \u203a Author: Expected a text value.",
    );
  });

  it("still explains itself with no named sections", () => {
    expect(formatInvalidSectionsMessage([])).toContain("validation errors");
  });
});
