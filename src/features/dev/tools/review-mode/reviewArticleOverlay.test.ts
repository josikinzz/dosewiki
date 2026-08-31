import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema";
import { buildCitationNumbering } from "@/lib/citations/referenceModel";
import type { Reference, SubstanceArticle } from "@/schema";
import { applyReviewArticleOverlay } from "./reviewArticleOverlay";

const reference: Reference = {
  id: "doi-10-1007-s002130100890",
  type: "journal_article",
  title: "Psychomotor stimulant effects of β-phenylethylamine",
  authors: [],
  doi: "10.1007/s002130100890",
  url: "https://doi.org/10.1007/s002130100890",
  sourceType: "primary_literature",
  quality: "fallback",
};

describe("applyReviewArticleOverlay", () => {
  it("resolves a newly saved source pasted into a dosage note without a reload", () => {
    const base = createEmptyArticle();
    const emptyRange = { min: null, max: null, unit: "mg" };
    const article: SubstanceArticle = {
      ...base,
      dosage: {
        ...base.dosage,
        routes: [
          {
            route: "oral",
            bioavailability: "",
            bioavailability_notes: "",
            dose_ranges: {
              threshold: emptyRange,
              light: emptyRange,
              moderate: emptyRange,
              strong: emptyRange,
              heavy: emptyRange,
            },
            notes: "",
          },
        ],
      },
    };

    const marker = `[cite:${reference.id}]`;
    const overlaid = applyReviewArticleOverlay(article, {
      savedReferences: [reference],
      fieldEdits: {
        "dosage.routes[0].notes": {
          before: "",
          value: `Functionally inactive without a MAO-B inhibitor${marker}.`,
        },
      },
    });
    const numbering = buildCitationNumbering(overlaid.references ?? [], overlaid);

    expect(overlaid.dosage.routes[0].notes).toContain(marker);
    expect(numbering.unknownIds).not.toContain(reference.id);
    expect(numbering.numbersById.get(reference.id)).toBe(1);
  });

  it("masks a removed reference and refuses to resurrect it from the saved overlay", () => {
    const article: SubstanceArticle = {
      ...createEmptyArticle(),
      references: [reference],
    };

    // A stale savedReferences entry for the same id must not undo the delete.
    const overlaid = applyReviewArticleOverlay(article, {
      savedReferences: [reference],
      removedReferenceIds: [reference.id],
    });

    expect(overlaid.references).toEqual([]);
  });
});
