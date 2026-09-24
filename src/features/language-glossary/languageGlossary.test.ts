import { describe, expect, it } from "vitest";
import { projectGlossary } from "./languageGlossary";

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

  it("projects approved wording without a recorded human check as live and unchecked", () => {
    const entries = projectGlossary(
      [],
      [
        { term: "Calm", kind: "effect-name", target: "平静", status: "approved", updated_at: 1 },
        { term: "Drift", kind: "effect-name", target: "漂移", status: "approved", provenance: "legacy_unverified", updated_at: 1 },
        { term: "Energy", kind: "effect-name", target: "活力", status: "approved", provenance: "human_review", updated_at: 1 },
        // A draft is never checked, whatever the live row behind it was.
        { term: "Glow", kind: "effect-name", target: "光晕", status: "draft", provenance: "human_review", updated_at: 1 },
      ],
    );
    expect(entries.map((entry) => [entry.term, entry.provenance])).toEqual([
      ["Calm", "legacy_unverified"],
      ["Drift", "legacy_unverified"],
      ["Energy", "human_review"],
      ["Glow", "machine_suggestion"],
    ]);
  });
});
