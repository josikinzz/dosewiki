import { describe, expect, it } from "vitest";
import {
  projectEditorArticle,
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
  editorial_review: {
    status: "needed",
    notes: "Editor-only notes",
  },
};

describe("substance read projections", () => {
  it("keeps editorial review out of the public preview, library, and search inputs", () => {
    expect(projectPublicPreview(article)).not.toHaveProperty("editorial_review");
    expect(projectLibraryInput(article)).not.toHaveProperty("editorial_review");
    expect(projectSearchInput(article)).not.toHaveProperty("editorial_review");
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

  describe("reviewer projections", () => {
    const reviewed = {
      ...article,
      editorial_review: {
        status: "completed" as const,
        notes: "Editor-only notes",
        reviewed_by: "oldhandle@local.dose.wiki",
        reviewed_at: "2026-08-01T00:00:00.000Z",
      },
    };

    it("projectReviewedArticleForEmails returns only the article identity and timestamp, never the reviewer email", () => {
      const projection = projectReviewedArticleForEmails(reviewed, new Set(["oldhandle@local.dose.wiki"]));

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

    it("projectReviewedArticleCredit returns only the slug and the claiming profile key, never the reviewer email", () => {
      const credit = projectReviewedArticleCredit(reviewed, new Map([["oldhandle@local.dose.wiki", "LYREA"]]));

      expect(credit).toEqual({ slug: "lsd", profileKey: "LYREA" });
      const serialized = JSON.stringify(credit);
      expect(serialized).not.toContain("oldhandle");
      expect(serialized).not.toContain("@");
      expect(serialized).not.toContain("notes");
    });
  });
});
