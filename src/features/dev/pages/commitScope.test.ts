import { describe, expect, it } from "vitest";

import { countChangedCategories, withChangeNote } from "./commitScope";

describe("countChangedCategories", () => {
  const base = { version: 1, categories: [{ key: "a", label: "A" }, { key: "b", label: "B" }] };

  it("counts edited, added and removed categories by key", () => {
    const next = { version: 1, categories: [{ key: "a", label: "A2" }, { key: "c", label: "C" }] };
    expect(countChangedCategories(base, next)).toBe(3);
  });

  it("never reports zero for a layout the diff marks as changed", () => {
    expect(countChangedCategories(base, { ...base, version: 2 })).toBe(1);
  });
});

describe("withChangeNote", () => {
  it("leads the changelog with the note and keeps the article list", () => {
    const payload = { changelog: { markdown: "# LSD\n", articles: [{ id: 1, title: "LSD", slug: "lsd" }] } };
    expect(withChangeNote(payload, "  Fix summary ")).toEqual({
      changelog: { markdown: "Note: Fix summary\n\n# LSD", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
    });
  });

  it("leaves the payload alone when the note is blank", () => {
    const payload = { articles: [] };
    expect(withChangeNote(payload, "   ")).toBe(payload);
  });
});
