import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mineHandler } from "../server/articleLifecycle";
import { minimalArticle } from "../src/test/fixtures/articles";
import { createCtx, type Row } from "./changeProposalSubmitFixture";

const SERVER_KEY = "test-admin-key";

function member(_id: string, email: string, role: string): Row & { email: string } {
  return { _id, email, role, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

const ada = member("m1", "ada@example.com", "editor");
const ben = member("m2", "ben@example.com", "editor");
const admin = member("m3", "admin@example.com", "admin");
const contributor = member("m4", "cleo@example.com", "contributor");

function draft(_id: string, ownerEmail: string, slug: string, updatedAt: string, withArticle = true): Row {
  return {
    _id, slug, ownerEmail, baseHash: "base", version: 2, updatedAt,
    ...(withArticle ? { article: { ...structuredClone(minimalArticle), slug, title: slug.toUpperCase() } } : {}),
  };
}

function proposal(_id: string, proposedBy: string, status: string, createdAt: string): Row {
  return {
    _id, _creationTime: Date.parse(createdAt), proposedBy, status, createdAt, updatedAt: createdAt,
    summary: `${proposedBy} ${status}`, targets: [{ kind: "article", key: "lsd", baseHash: "h" }], comments: [],
  };
}

function seed() {
  return createCtx({
    memberships: [ada, ben, admin, contributor],
    articleDrafts: [
      draft("d1", ada.email, "lsd", "2026-09-01T00:00:00.000Z"),
      draft("d2", ada.email, "dmt", "2026-09-03T00:00:00.000Z"),
      // Discarded: the row stays for its version counter, with no article.
      draft("d3", ada.email, "mdma", "2026-09-04T00:00:00.000Z", false),
      draft("d4", ben.email, "ketamine", "2026-09-05T00:00:00.000Z"),
      draft("d5", admin.email, "psilocybin", "2026-09-05T00:00:00.000Z"),
    ],
    changeProposals: [
      proposal("p1", ada.email, "submitted", "2026-09-02T00:00:00.000Z"),
      proposal("p2", ada.email, "changes_requested", "2026-09-06T00:00:00.000Z"),
      proposal("p3", ada.email, "applied", "2026-09-07T00:00:00.000Z"),
      proposal("p4", ben.email, "submitted", "2026-09-08T00:00:00.000Z"),
      proposal("p5", admin.email, "submitted", "2026-09-09T00:00:00.000Z"),
    ],
  });
}

describe("articleLifecycle.mine", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("returns only the caller's saved drafts and open proposals, newest first", async () => {
    const { ctx } = seed();

    const mine = await mineHandler(ctx, { apiKey: SERVER_KEY, actorEmail: ada.email });

    expect(mine.drafts).toEqual([
      { slug: "dmt", title: "DMT", updatedAt: "2026-09-03T00:00:00.000Z" },
      { slug: "lsd", title: "LSD", updatedAt: "2026-09-01T00:00:00.000Z" },
    ]);
    expect(mine.proposals.map((row) => row._id)).toEqual(["p2", "p1"]);
    expect(mine.proposals.every((row) => row.isAuthor)).toBe(true);
    expect(mine.proposals[0]).not.toHaveProperty("proposedBy");
  });

  it("scopes an admin to their own work too, never everyone's", async () => {
    const { ctx } = seed();

    const mine = await mineHandler(ctx, { apiKey: SERVER_KEY, actorEmail: admin.email });

    expect(mine.drafts.map((row) => row.slug)).toEqual(["psilocybin"]);
    expect(mine.proposals.map((row) => row._id)).toEqual(["p5"]);
  });

  it("refuses a contributor and a call with no signed-in member", async () => {
    const { ctx } = seed();

    await expect(mineHandler(ctx, { apiKey: SERVER_KEY, actorEmail: contributor.email })).rejects.toThrow();
    await expect(mineHandler(ctx, { apiKey: SERVER_KEY })).rejects.toThrow();
  });
});
