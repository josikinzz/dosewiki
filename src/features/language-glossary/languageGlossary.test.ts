import { describe, expect, it } from "vitest";
import {
  projectGlossary,
} from "./languageGlossary";

describe("public language glossary", () => {
  it("includes missing translations and exposes only reader fields", () => {
    const rows = [
      {
        locale: "ar",
        term: "Calm",
        kind: "effect-name",
        target: "هدوء",
        status: "draft" as const,
        updated_at: 42,
        reviewed_by: "private@example.com",
      },
    ];
    const entries = projectGlossary(
      [
        { term: "Calm", kind: "effect-name", gloss: "A calm feeling" },
        { term: "Energy", kind: "effect-name", gloss: "Feeling energetic" },
      ],
      rows,
    );
    expect(entries[0]).toMatchObject({
      term: "Calm",
      target: "هدوء",
      status: "draft",
    });
    expect(entries[0]).not.toHaveProperty("reviewed_by");
    expect(entries[1]).toMatchObject({
      term: "Energy",
      target: null,
      status: "missing",
      provenance: "missing",
      example: null,
    });
  });
});
