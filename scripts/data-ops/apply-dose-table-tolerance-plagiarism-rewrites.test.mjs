import { describe, expect, it } from "vitest";

import {
  buildRewritePlan,
  getByPath,
  normalizeArticleForPlagiarismRewriteSave,
} from "./apply-dose-table-tolerance-plagiarism-rewrites.mjs";

describe("dose table tolerance plagiarism rewrite planner", () => {
  it("merges multiple field rewrites into one affected article", () => {
    const articles = [
      {
        id: 1,
        title: "Clobazam",
        slug: "clobazam",
        dosage: { routes: [{ notes: "Old dose note." }] },
        tolerance: { full_tolerance: "Old tolerance note." },
      },
    ];
    const worklist = {
      workItems: [
        {
          id: "dose",
          slug: "clobazam",
          title: "Clobazam",
          fieldPath: "dosage.routes[0].notes",
          currentValue: "Old dose note.",
        },
        {
          id: "tolerance",
          slug: "clobazam",
          title: "Clobazam",
          fieldPath: "tolerance.full_tolerance",
          currentValue: "Old tolerance note.",
        },
      ],
    };
    const proposals = {
      proposals: [
        {
          id: "dose",
          slug: "clobazam",
          fieldPath: "dosage.routes[0].notes",
          replacementValue: "New dose note.",
        },
        {
          id: "tolerance",
          slug: "clobazam",
          fieldPath: "tolerance.full_tolerance",
          replacementValue: "New tolerance note.",
        },
      ],
    };

    const plan = buildRewritePlan({ articles, worklist, proposals });

    expect(plan.errors).toEqual([]);
    expect(plan.summary).toMatchObject({
      requestedRewriteCount: 2,
      pendingChangeCount: 2,
      affectedArticleCount: 1,
    });
    expect(getByPath(plan.affectedArticles[0], "dosage.routes[0].notes")).toBe("New dose note.");
    expect(getByPath(plan.affectedArticles[0], "tolerance.full_tolerance")).toBe("New tolerance note.");
  });

  it("blocks a rewrite when the live value no longer matches the audited current value", () => {
    const plan = buildRewritePlan({
      articles: [
        {
          id: 1,
          title: "Changed",
          slug: "changed",
          tolerance: { full_tolerance: "Edited by someone else." },
        },
      ],
      worklist: {
        workItems: [
          {
            id: "changed-tolerance",
            slug: "changed",
            title: "Changed",
            fieldPath: "tolerance.full_tolerance",
            currentValue: "Original audited text.",
          },
        ],
      },
      proposals: {
        proposals: [
          {
            id: "changed-tolerance",
            slug: "changed",
            fieldPath: "tolerance.full_tolerance",
            replacementValue: "Replacement text.",
          },
        ],
      },
    });

    expect(plan.summary.errorCount).toBe(1);
    expect(plan.errors[0]).toContain("live field no longer matches");
    expect(plan.affectedArticles).toEqual([]);
  });

  it("supports quoted object keys in field paths", () => {
    const plan = buildRewritePlan({
      articles: [
        {
          id: 1,
          title: "Legal",
          slug: "legal",
          legality: {
            countries: {
              "United States": {
                notes: "Old legal note.",
              },
            },
          },
        },
      ],
      worklist: {
        workItems: [
          {
            id: "legal-us",
            slug: "legal",
            title: "Legal",
            fieldPath: "legality.countries[\"United States\"].notes",
            currentValue: "Old legal note.",
          },
        ],
      },
      proposals: {
        proposals: [
          {
            id: "legal-us",
            slug: "legal",
            fieldPath: "legality.countries[\"United States\"].notes",
            replacementValue: "New legal note.",
          },
        ],
      },
    });

    expect(plan.errors).toEqual([]);
    expect(getByPath(plan.affectedArticles[0], "legality.countries[\"United States\"].notes")).toBe("New legal note.");
  });

  it("normalizes legacy save-blocking defaults without changing requested text fields", () => {
    const normalized = normalizeArticleForPlagiarismRewriteSave({
      id: 1,
      title: "Legacy",
      slug: "legacy",
      identification: {
        common_name: "Legacy",
        substitutive_name: null,
        smiles: null,
      },
      classification: {},
      subjective_effects: null,
      pharmacology: {
        pharmacokinetics: null,
        half_life: null,
      },
      reagent_testing: null,
      tolerance: {
        full_tolerance: "Requested replacement stays intact.",
        half_tolerance: null,
        baseline_tolerance: null,
      },
      references: [{ id: "bad", title: "Bad", template: "citation needed" }],
      citations: null,
    });

    expect(normalized.identification.substitutive_name).toBe("");
    expect(normalized.identification.alternative_names).toEqual([]);
    expect(normalized.subjective_effects.notes.overview).toBe("");
    expect(normalized.pharmacology.binding_sites).toEqual([]);
    expect(normalized.pharmacology.pharmacokinetics).toBe("");
    expect(normalized.reagent_testing).toEqual({});
    expect(normalized.tolerance.full_tolerance).toBe("Requested replacement stays intact.");
    expect(normalized.tolerance.half_tolerance).toBe("");
    expect(normalized.references[0].template).toBe("unknown");
    expect(normalized.citations).toEqual([]);
  });
});
