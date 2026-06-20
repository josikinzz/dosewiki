import { describe, expect, it } from "vitest";
import {
  projectEditorArticle,
  projectLibraryInput,
  projectLookup,
  projectPublicArticle,
  projectPublicPreview,
  projectSearchInput,
} from "../convex/lib/substanceReadProjections";
import { fullArticleWithDosage } from "../src/test/fixtures/articles";

const article = {
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
};

describe("substance read projections", () => {
  it("normalizes lookup fields without loading article content", () => {
    expect(projectLookup(article)).toEqual({
      slug: "lsd",
      name: "LSD",
      priority: "normal",
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

  it("keeps public library input free of editor metadata while search input stays trimmed", () => {
    const libraryInput = projectLibraryInput(article);
    const searchInput = projectSearchInput(article);

    expect(libraryInput).toMatchObject({
      title: "LSD",
      slug: "lsd",
      priority: "normal",
      identification: expect.any(Object),
      classification: expect.any(Object),
      comparisons: expect.any(Array),
      history_culture: expect.any(Object),
      legality: expect.any(Object),
      references: expect.any(Array),
      pharmacology: expect.any(Object),
      subjective_effects: expect.any(Object),
    });
    expect(libraryInput).not.toHaveProperty("editorial_review");
    expect(searchInput).not.toHaveProperty("harm_potential");
    expect(searchInput).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(searchInput).length).toBeLessThan(JSON.stringify(libraryInput).length);
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
      },
    });
  });

  it("derives a public-safe expert_reviewed flag from a completed review without leaking notes", () => {
    const reviewed = {
      ...structuredClone(article),
      editorial_review: { status: "completed", notes: "Editor-only notes" },
    };

    const publicArticle = projectPublicArticle(reviewed);

    expect(publicArticle.expert_reviewed).toBe(true);
    expect(publicArticle).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(publicArticle)).not.toContain("Editor-only notes");
  });
});
