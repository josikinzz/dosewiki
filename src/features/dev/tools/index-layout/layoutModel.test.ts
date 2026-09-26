import { describe, expect, it } from "vitest";

import { describeLayoutChanges, isLayoutConflictMessage, normalizeManual } from "./layoutModel";
import type { ManualIndexConfig } from "./types";

const NAMES: Record<string, string> = { lsd: "LSD", psilocybin: "Psilocybin", ketamine: "Ketamine", dxm: "DXM" };
const nameOf = (slug: string) => NAMES[slug] ?? slug;

const base: ManualIndexConfig = {
  version: 1,
  categories: [
    {
      key: "psychedelic",
      label: "Psychedelic",
      iconKey: "psychedelic",
      drugs: [],
      sections: [
        { key: "common", label: "Common", drugs: ["lsd", "psilocybin"] },
        { key: "other", label: "Other", drugs: [] },
      ],
    },
    { key: "dissociative", label: "Dissociative", iconKey: "dissociative", drugs: ["ketamine"], sections: [] },
  ],
};

describe("normalizeManual", () => {
  it("returns the same object when every list is present", () => {
    expect(normalizeManual(base)).toBe(base);
  });

  it("reads a missing sections or drugs list as empty", () => {
    const raw = { version: 1, categories: [{ key: "serotonergic", label: "Serotonergic", iconKey: "", drugs: ["lsd"] }] } as unknown as ManualIndexConfig;
    const safe = normalizeManual(raw);
    expect(safe).not.toBe(raw);
    expect(safe.categories[0].sections).toEqual([]);
    expect(safe.categories[0].drugs).toEqual(["lsd"]);
  });
});

describe("describeLayoutChanges", () => {
  it("says nothing for an unchanged layout", () => {
    expect(describeLayoutChanges(base, base, nameOf)).toEqual([]);
  });

  it("names a move between lists as one line", () => {
    const draft: ManualIndexConfig = {
      ...base,
      categories: [
        { ...base.categories[0], sections: [{ key: "common", label: "Common", drugs: ["psilocybin"] }, base.categories[0].sections[1]] },
        { ...base.categories[1], drugs: ["ketamine", "lsd"] },
      ],
    };
    expect(describeLayoutChanges(base, draft, nameOf).map((change) => change.text)).toEqual([
      "Moved LSD from Psychedelic, Common to Dissociative",
    ]);
  });

  it("names placements, removals out of the index, renames, new categories and reorders", () => {
    const draft: ManualIndexConfig = {
      ...base,
      categories: [
        {
          ...base.categories[0],
          label: "Psychedelics",
          sections: [{ key: "common", label: "Common", drugs: ["psilocybin", "lsd"] }, { key: "other", label: "Others", drugs: ["dxm"] }],
        },
        { ...base.categories[1], drugs: [] },
        { key: "nootropic", label: "Nootropic", iconKey: "", drugs: [], sections: [] },
      ],
    };
    const texts = describeLayoutChanges(base, draft, nameOf).map((change) => change.text);
    expect(texts).toContain("Renamed Psychedelic to Psychedelics");
    expect(texts).toContain("Renamed Other to Others in Psychedelics");
    expect(texts).toContain("Added the Nootropic category");
    expect(texts).toContain("Placed DXM in Psychedelics, Others");
    expect(texts).toContain("Took Ketamine out of the index (was in Dissociative)");
    expect(texts).toContain("Reordered Psychedelics, Common");
  });

  it("covers a removed category with one line rather than one per substance", () => {
    const draft: ManualIndexConfig = { ...base, categories: [base.categories[0]] };
    expect(describeLayoutChanges(base, draft, nameOf).map((change) => change.text)).toEqual(["Removed the Dissociative category"]);
  });
});

describe("isLayoutConflictMessage", () => {
  it("reads the route's conflict code or words", () => {
    expect(isLayoutConflictMessage("Published content changed since you opened this editor. (code=EDIT_CONFLICT)")).toBe(true);
    expect(isLayoutConflictMessage("Unable to save to Postgres.")).toBe(false);
    expect(isLayoutConflictMessage(null)).toBe(false);
  });
});
