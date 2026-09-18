import { describe, expect, it } from "vitest";
import {
  assertEditorialReviewMutationAllowed,
  canMutateEditorialReview,
  getDefaultEditorialReview,
  isEditorialReviewAllowed,
  projectEditorArticle,
  projectPublicArticle,
} from "./editorialReviewVisibilityPolicy";
import { projectPublicArticle as projectDataPublicArticle } from "../../data/projections/substanceReadProjections";

describe("editorialReviewVisibilityPolicy", () => {
  it("answers visibility for public, editor, generated, batch, prepopulate, export, and import modes", () => {
    expect(isEditorialReviewAllowed("public_read")).toBe(false);
    expect(isEditorialReviewAllowed("editor_read")).toBe(true);
    expect(isEditorialReviewAllowed("generated_update")).toBe(false);
    expect(isEditorialReviewAllowed("generated_output")).toBe(false);
    expect(isEditorialReviewAllowed("batch_input")).toBe(true);
    expect(isEditorialReviewAllowed("prepopulate")).toBe(true);
    expect(isEditorialReviewAllowed("export")).toBe(true);
    expect(isEditorialReviewAllowed("import")).toBe(true);
  });

  it("keeps mutation authority on editor, prepopulate, and import paths only", () => {
    expect(canMutateEditorialReview("editor_read")).toBe(true);
    expect(canMutateEditorialReview("prepopulate")).toBe(true);
    expect(canMutateEditorialReview("import")).toBe(true);
    expect(canMutateEditorialReview("generated_update")).toBe(false);
    expect(canMutateEditorialReview("batch_input")).toBe(false);
    expect(canMutateEditorialReview("export")).toBe(false);
  });

  it("strips editorial_review from public article projections", () => {
    const article = {
      title: "LSD",
      editorial_review: {
        status: "completed",
        notes: "Internal note",
        flags: [{
          label: "Public leak sentinel",
          severity: "major",
          note: "FLAG_SECRET_100",
          source: "agent",
          run_id: "review-run-secret",
          created_at: "2026-08-02T12:00:00.000Z",
        }],
      },
    };

    expect(projectPublicArticle(article)).toEqual({ title: "LSD" });
    expect(projectPublicArticle(article)).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(projectPublicArticle(article))).not.toContain("FLAG_SECRET_100");
  });

  it("keeps the Postgres public article projection free of Review Flag data", () => {
    const projection = projectDataPublicArticle({
      title: "LSD",
      slug: "lsd",
      editorial_review: {
        status: "completed",
        notes: "Private",
        flags: [{
          label: "Flag sentinel",
          severity: "major",
          note: "FLAG_SECRET_DATA_100",
          source: "agent",
          run_id: "private-review-run",
          created_at: "2026-08-02T12:00:00.000Z",
        }],
      },
    } as never);

    expect(projection.expert_reviewed).toBe(true);
    expect(projection).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(projection)).not.toContain("FLAG_SECRET_DATA_100");
  });

  it("preserves and defaults editorial_review for editor projections", () => {
    expect(projectEditorArticle({ title: "LSD" }).editorial_review).toEqual(getDefaultEditorialReview());
    expect(projectEditorArticle({
      title: "LSD",
      editorial_review: {
        status: "completed",
        notes: "Reviewed",
      },
    }).editorial_review).toEqual({
      status: "completed",
      notes: "Reviewed",
    });
  });

  it("rejects ordinary generated updates that try to mutate editorial_review", () => {
    expect(() => assertEditorialReviewMutationAllowed("generated_update", ["summary"])).not.toThrow();
    expect(() => assertEditorialReviewMutationAllowed("generated_update", ["editorial_review"])).toThrow(
      "editorial_review is editor-only metadata",
    );
  });
});
