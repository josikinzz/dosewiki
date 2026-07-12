import { describe, expect, it } from "vitest";
import {
  buildClassTemplateMemberOptions,
  CLASS_TEMPLATE_OPTIONS,
} from "./classTemplateOptions";

describe("CLASS_TEMPLATE_OPTIONS", () => {
  it("builds searchable key/label options from the canonical class vocabulary", () => {
    expect(CLASS_TEMPLATE_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(CLASS_TEMPLATE_OPTIONS.map((option) => option.key)).size).toBe(
      CLASS_TEMPLATE_OPTIONS.length,
    );
    expect(
      CLASS_TEMPLATE_OPTIONS.every(
        (option) => option.key.trim().length > 0 && option.label.trim().length > 0,
      ),
    ).toBe(true);
  });

  it("builds rolled members and only includes depictions with stored molblocks", () => {
    const members = buildClassTemplateMemberOptions(
      "phenethylamine",
      [
        {
          slug: "amphetamine",
          title: "Amphetamine",
          classification: { chemical_class: ["Phenethylamine", "Amphetamine"] },
        },
        {
          slug: "mescaline",
          title: "Mescaline",
          classification: { chemical_class: ["Phenethylamine"] },
        },
        {
          slug: "morphine",
          title: "Morphine",
          classification: { chemical_class: ["Morphinan"] },
        },
        {
          slug: "hidden-amphetamine",
          title: "Hidden amphetamine",
          index_categories: ["hidden"],
          classification: { chemical_class: ["Amphetamine"] },
        },
        {
          slug: "low-priority-amphetamine",
          title: "Low priority amphetamine",
          priority: "low",
          classification: { chemical_class: ["Amphetamine"] },
        },
      ],
      new Set([
        "amphetamine",
        "morphine",
        "hidden-amphetamine",
        "low-priority-amphetamine",
      ]),
    );

    expect(members).toEqual([{ slug: "amphetamine", title: "Amphetamine" }]);
  });

  it("can return every rolled visible member for apply preview reporting", () => {
    expect(
      buildClassTemplateMemberOptions("morphinan", [
        {
          slug: "visible-without-override",
          title: "Visible without override",
          classification: { chemical_class: ["Morphinan"] },
        },
        {
          slug: "visible-without-override",
          title: "Duplicate visible member",
          classification: { chemical_class: ["Morphinan"] },
        },
        {
          slug: "hidden",
          title: "Hidden",
          index_categories: ["hidden"],
          classification: { chemical_class: ["Morphinan"] },
        },
      ]),
    ).toEqual([{ slug: "visible-without-override", title: "Visible without override" }]);
  });
});
