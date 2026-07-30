import { describe, expect, it } from "vitest";
import type { FieldErrors } from "react-hook-form";
import type { SubstanceArticle } from "@/schema";

import {
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

describe("formatInvalidSectionsMessage", () => {
  it("names a single failing section", () => {
    expect(formatInvalidSectionsMessage(["Overview"])).toContain("Overview");
  });

  it("joins several failing sections", () => {
    expect(formatInvalidSectionsMessage(["Overview", "Legality", "References"])).toBe(
      "Fix the highlighted fields in Overview, Legality and References before applying this draft.",
    );
  });

  it("still explains itself with no named sections", () => {
    expect(formatInvalidSectionsMessage([])).toContain("validation errors");
  });
});
