import { describe, expect, it } from "vitest";
import {
  projectEditorArticle,
  projectEditorLibraryEntry,
  projectEditorLookup,
  projectLibraryInput,
  projectLookup,
  projectMechanismRouteInput,
  projectPublicArticle,
  projectPublicPreview,
  projectSearchInput,
  projectReviewedArticleCredit,
  projectReviewedArticleForEmails,
} from "../src/data/projections/substanceReadProjections";
import { substanceArticleSchema, type SubstanceArticle } from "../src/schema";
import { fullArticleWithDosage } from "../src/test/fixtures/articles";

const article: SubstanceArticle & { slug?: string } = {
  ...structuredClone(fullArticleWithDosage),
  slug: undefined,
  priority: null,
  summary: " ".repeat(4) + "A".repeat(240),
  editorial_review: {
    status: "needed",
    notes: "Editor-only notes",
  },
  history_culture: {
    content: "x".repeat(400),
    sections: [],
  },
  harm_potential: {
    ...structuredClone(fullArticleWithDosage.harm_potential),
    addiction_liability: "Low addiction liability.",
    large_unused_detail: "x".repeat(400),
  },
  references: [
    {
      id: "identified-reference",
      type: "journal_article",
      title: "Identified reference",
      authors: [],
      doi: "10.1000/example",
      pmid: "12345678",
      url: "https://example.test/reference",
      sourceType: "primary_literature",
      quality: "high",
    },
    {
      id: "metadata-only-reference",
      type: "book",
      title: "Metadata-only reference",
      authors: ["Example Author"],
      sourceType: "book",
      quality: "medium",
    },
  ],
};

function findUndefinedPaths(value: unknown, path = "$"): string[] {
  if (value === undefined) {
    return [path];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findUndefinedPaths(entry, `${path}[${index}]`),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      findUndefinedPaths(entry, `${path}.${key}`),
    );
  }

  return [];
}

describe("substance read projections", () => {
  it("normalizes lookup fields without loading article content", () => {
    expect(projectLookup(article)).toEqual({
      slug: "lsd",
      name: "LSD",
      priority: "normal",
    });
  });

  it("adds the editor picker's visibility and category facets to the lookup shape", () => {
    expect(projectEditorLookup(article)).toEqual({
      slug: "lsd",
      name: "LSD",
      priority: "normal",
      indexCategories: ["Psychedelics", "Research Chemicals"],
      psychoactiveClasses: article.classification.psychoactive_class,
    });
  });

  it("returns public previews with fallback slug, priority defaults, and trimmed summaries", () => {
    const preview = projectPublicPreview(article);

    expect(preview).toMatchObject({
      title: "LSD",
      slug: "lsd",
      priority: "normal",
      indexCategories: ["Psychedelics", "Research Chemicals"],
    });
    expect(preview.summary).toHaveLength(201);
    expect(preview.summary.endsWith("…")).toBe(true);
    expect(preview).not.toHaveProperty("editorial_review");
  });

  it("projects the public library input down to builder-read fields", () => {
    const libraryInput = projectLibraryInput(article);
    const searchInput = projectSearchInput(article);

    expect(libraryInput).toMatchObject({
      title: "LSD",
      slug: "lsd",
      priority: "normal",
      identification: expect.any(Object),
      classification: expect.any(Object),
      pharmacology: expect.any(Object),
      subjective_effects: expect.any(Object),
      harm_potential: {
        addiction_liability: "Low addiction liability.",
      },
    });
    expect(libraryInput).not.toHaveProperty("comparisons");
    expect(libraryInput).not.toHaveProperty("history_culture");
    expect(libraryInput).not.toHaveProperty("legality");
    expect(libraryInput).not.toHaveProperty("editorial_review");
    expect(libraryInput.references).toEqual([
      {
        url: "https://example.test/reference",
        doi: "10.1000/example",
        pmid: "12345678",
      },
      {},
    ]);
    expect(libraryInput.references).toHaveLength(article.references.length);
    expect(libraryInput.dosage).toEqual({
      routes: [
        expect.not.objectContaining({
          bioavailability_notes: expect.anything(),
          reference_ids: expect.anything(),
        }),
      ],
    });
    expect(libraryInput.duration.routes[0]).not.toHaveProperty("half_life");
    expect(libraryInput.duration.routes[0]).not.toHaveProperty("half_life_notes");
    expect(searchInput).not.toHaveProperty("harm_potential");
    expect(searchInput).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(searchInput).length).toBeLessThan(JSON.stringify(libraryInput).length);
  });

  it("never emits undefined anywhere in a projected library corpus", () => {
    const incompleteStoredArticle = {
      ...structuredClone(article),
      source_citations: undefined,
      dosage: {
        routes: [
          {
            route: "Oral",
            dose_ranges: {
              threshold: { min: undefined, max: 25, unit: "µg" },
              light: { min: 25, max: 75, unit: "µg" },
              moderate: { min: 75, max: 150, unit: "µg" },
              strong: { min: 150, max: 300, unit: "µg" },
              heavy: { min: 300, max: null, unit: "µg" },
            },
            bioavailability: undefined,
            notes: undefined,
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "Oral",
            half_life: undefined,
            half_life_notes: undefined,
            stages: {
              onset: { min: undefined, max: 60, unit: "minutes" },
              come_up: { min: 30, max: 90, unit: "minutes" },
              peak: { min: 2, max: 5, unit: "hours" },
              offset: { min: 3, max: 5, unit: "hours" },
              after_effects: { min: null, max: null, unit: "" },
              total_duration: { min: 8, max: 12, unit: "hours" },
            },
          },
        ],
      },
    };

    const projectedCorpus = [
      article,
      incompleteStoredArticle,
    ].map((record) => projectLibraryInput(record as never));

    expect(findUndefinedPaths(projectedCorpus)).toEqual([]);
    expect(findUndefinedPaths(projectMechanismRouteInput(article))).toEqual([]);
  });

  it("projects only the normalized inputs needed for mechanism routes", () => {
    expect(projectMechanismRouteInput(article)).toEqual({
      displayName: "LSD",
      priority: "normal",
      indexCategories: ["Psychedelics", "Research Chemicals"],
      mechanisms: [
        {
          label: "5-HT2A receptor agonist",
          base: "5-HT2A receptor agonist",
          slug: "5-ht2a-receptor-agonist",
        },
      ],
    });
  });

  it("canonicalizes legacy-only mechanisms during the staged read migration", () => {
    const schemaRejectedStoredRecord = {
      title: "Legacy mechanism record",
      priority: "normal",
      index_categories: [],
      identification: {
        common_name: "Legacy mechanism record",
      },
      pharmacology: {
        mechanism_of_action: ["Dopamine releaser"],
      },
    };

    expect(substanceArticleSchema.safeParse(schemaRejectedStoredRecord).success).toBe(false);
    expect(projectMechanismRouteInput(schemaRejectedStoredRecord as never)).toEqual({
      displayName: "Legacy mechanism record",
      priority: "normal",
      indexCategories: [],
      mechanisms: [
        {
          label: "Dopamine releaser",
          base: "Dopamine releaser",
          slug: "dopamine-releaser",
        },
      ],
    });
  });

  it("separates public article and editor article visibility", () => {
    const publicArticle = projectPublicArticle(article);
    expect(publicArticle).not.toHaveProperty("editorial_review");
    expect(publicArticle.expert_reviewed).toBe(false);
    expect(projectEditorArticle(article)).toMatchObject({
      slug: "lsd",
      priority: "normal",
      editorial_review: {
        status: "needed",
        notes: "Editor-only notes",
      },
      references: expect.any(Array),
    });
  });

  it("names rendered article content, not private editorial notes or Postgres storage identity", () => {
    const revision = projectPublicArticle(article).publicRevision;
    expect(projectPublicArticle({
      ...article, _id: "another-storage-id", _creationTime: 1,
      editorial_review: { ...article.editorial_review, notes: "Different private note" },
    } as never).publicRevision).toBe(revision);
    expect(projectPublicArticle({ ...article, summary: "A public correction" }).publicRevision).not.toBe(revision);
  });

  it("keeps hide-for-now editorially while projecting low priority publicly", () => {
    const hiddenForNowArticle = {
      ...article,
      priority: "hide_for_now",
    } satisfies SubstanceArticle & { slug?: string };

    expect(substanceArticleSchema.safeParse(hiddenForNowArticle).success).toBe(true);
    expect(projectEditorArticle(hiddenForNowArticle).priority).toBe("hide_for_now");
    expect(projectLookup(hiddenForNowArticle).priority).toBe("low");
    expect(projectPublicPreview(hiddenForNowArticle).priority).toBe("low");
    expect(projectLibraryInput(hiddenForNowArticle).priority).toBe("low");
    expect(projectMechanismRouteInput(hiddenForNowArticle).priority).toBe("low");
    expect(projectPublicArticle(hiddenForNowArticle).priority).toBe("low");
  });

  it("derives a public-safe expert_reviewed flag from a completed review without leaking notes", () => {
    const reviewed = {
      ...structuredClone(article),
      editorial_review: { status: "completed" as const, notes: "Editor-only notes" },
    };

    const publicArticle = projectPublicArticle(reviewed);

    expect(publicArticle.expert_reviewed).toBe(true);
    expect(publicArticle).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(publicArticle)).not.toContain("Editor-only notes");
  });

  describe("projectEditorLibraryEntry", () => {
    it("carries the identity, taxonomy, and review state the library list reads", () => {
      const entry = projectEditorLibraryEntry(article);

      expect(entry.slug).toBe(projectEditorArticle(article).slug);
      expect(entry.title).toBe(article.title);
      expect(entry.priority).toBe("normal");
      expect(entry.index_categories).toEqual(article.index_categories);
      expect(entry.identification).toEqual(article.identification);
      expect(entry.classification).toEqual(article.classification);
      // Editor-only state is exactly why this projection stays editor-gated.
      expect(entry.editorial_review).toEqual({
        status: "needed",
        notes: "Editor-only notes",
      });
    });

    it("drops every field only a whole article renders", () => {
      const entry = projectEditorLibraryEntry(article) as Record<string, unknown>;

      for (const field of [
        "summary",
        "dosage",
        "duration",
        "interactions",
        "tolerance",
        "reagent_testing",
        "harm_potential",
        "history_culture",
        "legality",
        "comparisons",
        "references",
        "source_citations",
        "citations",
      ]) {
        expect(entry).not.toHaveProperty(field);
      }
    });

    it("keeps binding-site mechanism tags but no pharmacology prose", () => {
      const entry = projectEditorLibraryEntry({
        ...article,
        pharmacology: {
          ...article.pharmacology,
          pharmacodynamics: "x".repeat(400),
          binding_sites: [
            { target: "5-HT2A", tag: "serotonergic-psychedelic", affinity: "1.1 nM", efficacy: "partial agonist" },
          ],
        },
      });

      expect(entry.pharmacology).toEqual({
        binding_sites: [{ target: "5-HT2A", tag: "serotonergic-psychedelic" }],
      });
    });

    it("keeps effect names and drops their descriptions", () => {
      const entry = projectEditorLibraryEntry({
        ...article,
        subjective_effects: {
          ...article.subjective_effects,
          cognitive: {
            General: {
              note: "A note nobody reads across the corpus.",
              effects: [{ name: "Time distortion", description: "x".repeat(400) }],
            },
          },
        },
      });

      expect(entry.subjective_effects.cognitive).toEqual({
        General: {
          note: "",
          effects: [{ name: "Time distortion", description: "" }],
        },
      });
    });

    it("is smaller than the whole editor article", () => {
      const listBytes = JSON.stringify(projectEditorLibraryEntry(article)).length;
      const articleBytes = JSON.stringify(projectEditorArticle(article)).length;

      // The fixture is a deliberately small article; against the live corpus,
      // where references alone are ~57% of the bytes, the same projection takes
      // the whole-corpus drain from ~16.7 MB to under 0.8 MB.
      expect(listBytes).toBeLessThan(articleBytes);
    });
  });

  describe("projectReviewedArticleForEmails", () => {
    const reviewed = {
      ...article,
      editorial_review: {
        status: "completed" as const,
        notes: "Editor-only notes",
        reviewed_by: "oldhandle@local.dose.wiki",
        reviewed_at: "2026-08-01T00:00:00.000Z",
      },
    };
    const reviewerEmails = new Set(["oldhandle@local.dose.wiki"]);

    it("returns only the article identity and timestamp — never the reviewer email", () => {
      const projection = projectReviewedArticleForEmails(reviewed, reviewerEmails);

      expect(projection).toEqual({
        title: "LSD",
        slug: "lsd",
        reviewed_at: "2026-08-01T00:00:00.000Z",
      });
      // The privacy contract, stated as bytes: nothing resembling the stamp's
      // email or the editor notes survives into the projection.
      const serialized = JSON.stringify(projection);
      expect(serialized).not.toContain("oldhandle");
      expect(serialized).not.toContain("@");
      expect(serialized).not.toContain("notes");
    });

    it("matches the stored stamp case- and whitespace-insensitively", () => {
      const projection = projectReviewedArticleForEmails(
        {
          ...reviewed,
          editorial_review: {
            ...reviewed.editorial_review,
            reviewed_by: " Oldhandle@Local.dose.wiki ",
          },
        },
        reviewerEmails,
      );

      expect(projection?.slug).toBe("lsd");
    });

    it("returns null for another reviewer's stamp", () => {
      expect(
        projectReviewedArticleForEmails(reviewed, new Set(["josie@local.dose.wiki"])),
      ).toBeNull();
    });

    it("returns null when the review is not completed", () => {
      expect(
        projectReviewedArticleForEmails(
          { ...reviewed, editorial_review: { ...reviewed.editorial_review, status: "in_progress" as const } },
          reviewerEmails,
        ),
      ).toBeNull();
    });

    it("returns null when the article carries no review or no stamp", () => {
      expect(projectReviewedArticleForEmails(article, reviewerEmails)).toBeNull();
      expect(
        projectReviewedArticleForEmails(
          { ...article, editorial_review: undefined },
          reviewerEmails,
        ),
      ).toBeNull();
    });
  });

  describe("projectReviewedArticleCredit", () => {
    const reviewed = {
      ...article,
      editorial_review: {
        status: "completed" as const,
        notes: "Editor-only notes",
        reviewed_by: "oldhandle@local.dose.wiki",
        reviewed_at: "2026-08-01T00:00:00.000Z",
      },
    };
    const emailToProfileKey = new Map([["oldhandle@local.dose.wiki", "LYREA"]]);

    it("returns only the slug and the claiming profile key — never the reviewer email", () => {
      const credit = projectReviewedArticleCredit(reviewed, emailToProfileKey);

      expect(credit).toEqual({ slug: "lsd", profileKey: "LYREA" });
      // The same privacy contract as the per-contributor projection above.
      const serialized = JSON.stringify(credit);
      expect(serialized).not.toContain("oldhandle");
      expect(serialized).not.toContain("@");
      expect(serialized).not.toContain("notes");
    });

    it("matches the stored stamp case- and whitespace-insensitively", () => {
      const credit = projectReviewedArticleCredit(
        {
          ...reviewed,
          editorial_review: {
            ...reviewed.editorial_review,
            reviewed_by: " Oldhandle@Local.dose.wiki ",
          },
        },
        emailToProfileKey,
      );

      expect(credit).toEqual({ slug: "lsd", profileKey: "LYREA" });
    });

    it("returns null for a stamp no profile claims", () => {
      expect(
        projectReviewedArticleCredit(
          reviewed,
          new Map([["josie@local.dose.wiki", "JOSIE"]]),
        ),
      ).toBeNull();
    });

    it("returns null when the review is not completed or absent", () => {
      expect(
        projectReviewedArticleCredit(
          { ...reviewed, editorial_review: { ...reviewed.editorial_review, status: "in_progress" as const } },
          emailToProfileKey,
        ),
      ).toBeNull();
      expect(projectReviewedArticleCredit(article, emailToProfileKey)).toBeNull();
    });
  });
});
