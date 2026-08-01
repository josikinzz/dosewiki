import { describe, expect, it } from "vitest";

import type { ReviewStatus } from "../substance-editor/types";
import { resolveReviewCelebration } from "./reviewDelight";
import type { ReviewQueueEntry, ReviewQueueGroup } from "./reviewQueue";
import { UNPLACED_GROUP_KEY } from "./reviewQueue";

function entry(slug: string, status: ReviewStatus = "needed"): ReviewQueueEntry {
  return { slug, name: slug.toUpperCase(), status, referenceCount: 0 };
}

function group(overrides: Partial<ReviewQueueGroup>): ReviewQueueGroup {
  const sections = overrides.sections ?? [];
  const entries = overrides.entries ?? [];
  return {
    key: "psychedelic",
    label: "Psychedelics",
    iconKey: undefined,
    count:
      entries.length +
      sections.reduce((total, section) => total + section.entries.length, 0),
    ...overrides,
    sections,
    entries,
  };
}

describe("resolveReviewCelebration", () => {
  it("returns null while the section still has other unreviewed entries", () => {
    const groups = [
      group({
        sections: [
          {
            key: "lysergamide",
            label: "Lysergamides",
            entries: [entry("lsd"), entry("ald-52"), entry("1p-lsd")],
          },
        ],
      }),
    ];
    expect(resolveReviewCelebration(groups, "lsd")).toBeNull();
  });

  it("celebrates the section when the tick finishes it, with other sections open", () => {
    const groups = [
      group({
        sections: [
          {
            key: "lysergamide",
            label: "Lysergamides",
            entries: [entry("lsd", "completed"), entry("ald-52")],
          },
          {
            key: "tryptamine",
            label: "Tryptamines",
            entries: [entry("dmt")],
          },
        ],
      }),
    ];
    expect(resolveReviewCelebration(groups, "ald-52")).toEqual({
      level: "section",
      label: "Lysergamides",
      total: 2,
    });
  });

  it("counts the ticked slug as completed even when its recorded status is not", () => {
    const groups = [
      group({
        sections: [
          {
            key: "lysergamide",
            label: "Lysergamides",
            entries: [entry("lsd", "in_progress"), entry("ald-52", "completed")],
          },
          { key: "tryptamine", label: "Tryptamines", entries: [entry("dmt")] },
        ],
      }),
    ];
    const celebration = resolveReviewCelebration(groups, "lsd");
    expect(celebration?.level).toBe("section");
  });

  it("celebrates the whole group over the section when the tick finishes both", () => {
    const groups = [
      group({
        key: "psychedelic",
        label: "Psychedelics",
        iconKey: "psychedelics",
        sections: [
          {
            key: "lysergamide",
            label: "Lysergamides",
            entries: [entry("lsd", "completed"), entry("ald-52")],
          },
          {
            key: "tryptamine",
            label: "Tryptamines",
            entries: [entry("dmt", "completed")],
          },
        ],
        entries: [entry("mescaline", "completed")],
      }),
    ];
    expect(resolveReviewCelebration(groups, "ald-52")).toEqual({
      level: "group",
      label: "Psychedelics",
      iconKey: "psychedelics",
      total: 4,
    });
  });

  it("falls back to the group key when the group has no icon key", () => {
    const groups = [
      group({
        key: "stimulant",
        label: "Stimulants",
        sections: [],
        entries: [entry("caffeine")],
      }),
    ];
    expect(resolveReviewCelebration(groups, "caffeine")?.iconKey).toBe(
      "stimulant",
    );
  });

  it("celebrates a loose entry that finishes its group", () => {
    const groups = [
      group({
        sections: [
          {
            key: "lysergamide",
            label: "Lysergamides",
            entries: [entry("lsd", "completed")],
          },
        ],
        entries: [entry("mescaline")],
      }),
    ];
    expect(resolveReviewCelebration(groups, "mescaline")?.level).toBe("group");
  });

  it("never celebrates the unplaced bucket", () => {
    const groups = [
      group({
        key: UNPLACED_GROUP_KEY,
        label: "Not on the index",
        sections: [],
        entries: [entry("mystery")],
      }),
    ];
    expect(resolveReviewCelebration(groups, "mystery")).toBeNull();
  });

  it("returns null for a slug that is in no group", () => {
    const groups = [
      group({ sections: [], entries: [entry("lsd", "completed")] }),
    ];
    expect(resolveReviewCelebration(groups, "unknown")).toBeNull();
  });

  it("only consults the slug's own group, not later ones", () => {
    const groups = [
      group({
        key: "psychedelic",
        label: "Psychedelics",
        sections: [],
        entries: [entry("lsd"), entry("dmt")],
      }),
      group({
        key: "stimulant",
        label: "Stimulants",
        sections: [],
        entries: [entry("lsd", "completed")],
      }),
    ];
    expect(resolveReviewCelebration(groups, "lsd")).toBeNull();
  });
});
