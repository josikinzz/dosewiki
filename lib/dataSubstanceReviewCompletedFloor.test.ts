import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setEditorialReviewHandler } from "../server/lib/substanceReviewHandlers";

type Role = "admin" | "editor" | "contributor" | "viewer";

const patch = vi.fn(async () => undefined);

/**
 * Mirrors the ctx shape in `dataSubstanceIndexEditorReadAuth.test.ts`, plus
 * the one article row the review handler reads and patches once authorized.
 */
function createCtx(memberships: Record<string, Role>, article: Record<string, unknown> | null) {
  return {
    auth: { getUserIdentity: vi.fn(async () => null) },
    db: {
      patch,
      query: vi.fn((table: string) => ({
        withIndex: (
          _indexName: string,
          selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
        ) => {
          let key = "";
          selector({
            eq: (_field, value) => {
              key = value;
              return {};
            },
          });
          if (table === "substanceIndex") {
            return { first: vi.fn(async () => article) };
          }
          return {
            unique: vi.fn(async () => {
              const role = memberships[key];
              return role ? { email: key, role } : null;
            }),
          };
        },
      })),
    },
  } as never;
}

const article = { _id: "article-id", slug: "2c-b", editorial_review: { status: "needed", notes: "keep me" } };
const memberships: Record<string, Role> = {
  "admin@example.com": "admin",
  "editor@example.com": "editor",
  "contributor@example.com": "contributor",
};

function tick(actorEmail: string, status: "needed" | "in_progress" | "completed") {
  return setEditorialReviewHandler(createCtx(memberships, article), {
    apiKey: "secret",
    actorEmail,
    slug: "2c-b",
    status,
  });
}

describe("setEditorialReviewHandler completed floor", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = "secret";
    patch.mockClear();
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("lets an editor move a review to in_progress and keeps the notes", async () => {
    await expect(tick("editor@example.com", "in_progress")).resolves.toMatchObject({
      slug: "2c-b",
      editorial_review: { status: "in_progress", notes: "keep me" },
    });
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("refuses an editor marking a review completed before touching the article", async () => {
    await expect(tick("editor@example.com", "completed")).rejects.toThrow("Admin access required");
    expect(patch).not.toHaveBeenCalled();
  });

  it("lets an admin mark a review completed and stamps the reviewer", async () => {
    await expect(tick("admin@example.com", "completed")).resolves.toMatchObject({
      editorial_review: { status: "completed", reviewed_by: "admin@example.com" },
    });
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("refuses a contributor at every status", async () => {
    await expect(tick("contributor@example.com", "needed")).rejects.toThrow("Editor access required");
    await expect(tick("contributor@example.com", "completed")).rejects.toThrow("Admin access required");
    expect(patch).not.toHaveBeenCalled();
  });

  it("treats a server-key call without an actor as an admin script", async () => {
    await expect(
      setEditorialReviewHandler(createCtx(memberships, article), {
        apiKey: "secret",
        slug: "2c-b",
        status: "completed",
      }),
    ).resolves.toMatchObject({ editorial_review: { status: "completed" } });
  });
});
