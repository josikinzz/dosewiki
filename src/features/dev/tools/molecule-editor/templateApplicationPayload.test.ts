import { describe, expect, it } from "vitest";

import {
  buildTemplateApplyPayload,
  chunkTemplateApplyMembers,
  mapMembersToTemplatePlanInput,
  summarizeTemplatePreview,
  type TemplateApplyPreviewRow,
} from "./templateApplicationPayload";

describe("template application payload helpers", () => {
  it("maps rolled members to plan input in display order and reports missing rows", () => {
    expect(
      mapMembersToTemplatePlanInput(
        [
          { slug: "alpha", title: "Alpha" },
          { slug: "beta", title: "Beta" },
          { slug: "gamma", title: "Gamma" },
        ],
        [
          { slug: "gamma", molblock: "gamma mol", source: "template" },
          { slug: "alpha", molblock: "alpha mol", source: "editor" },
        ],
      ),
    ).toEqual({
      planMembers: [
        { slug: "alpha", molblock: "alpha mol", source: "editor" },
        { slug: "gamma", molblock: "gamma mol", source: "template" },
      ],
      missingMembers: [{ slug: "beta", title: "Beta" }],
    });
  });

  it("sends only included aligned rows without changing their plan molblocks", () => {
    const exactPlanMolblock = "plan output\n  must stay exact  \n";
    const rows: TemplateApplyPreviewRow[] = [
      {
        slug: "included",
        title: "Included",
        beforeSvg: "<svg />",
        outcome: "aligned",
        alignedMolblock: exactPlanMolblock,
        afterSvg: "<svg>after</svg>",
      },
      {
        slug: "unchecked",
        title: "Unchecked",
        beforeSvg: "<svg />",
        outcome: "aligned",
        alignedMolblock: "unchecked mol",
        afterSvg: "<svg>unchecked</svg>",
      },
      {
        slug: "no-match",
        title: "No match",
        beforeSvg: "<svg />",
        outcome: "no-match",
      },
    ];

    expect(buildTemplateApplyPayload("morphinan", rows, new Set(["included"]))).toEqual({
      classKey: "morphinan",
      members: [
        {
          slug: "included",
          molblock: exactPlanMolblock,
          svg: "<svg>after</svg>",
        },
      ],
    });
  });

  it("summarizes every preview outcome", () => {
    const row = (outcome: TemplateApplyPreviewRow["outcome"]): TemplateApplyPreviewRow => ({
      slug: outcome,
      title: outcome,
      beforeSvg: null,
      outcome,
    });
    expect(
      summarizeTemplatePreview([
        row("aligned"),
        row("aligned"),
        row("no-match"),
        row("protected-hand-edit"),
        row("error"),
      ]),
    ).toEqual({ aligned: 2, noMatch: 1, protected: 1, errors: 1 });
  });

  it("chunks large classes at the request limit without losing order", () => {
    expect(chunkTemplateApplyMembers([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
