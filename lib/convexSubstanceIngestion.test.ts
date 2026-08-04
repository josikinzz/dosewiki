import { describe, expect, it } from "vitest";
import { ingestSubstanceArticle, ingestSubstanceArticles } from "../convex/lib/substanceIngestion";
import { minimalArticle } from "../src/test/fixtures/articles";

type TestArticle = typeof minimalArticle & { id: number | null; title: string; slug?: string };
type StoredArticle = TestArticle & { _id: string };

function article(overrides: Partial<TestArticle> = {}): TestArticle {
  const hasIdOverride = Object.prototype.hasOwnProperty.call(overrides, "id");
  return {
    ...structuredClone(minimalArticle),
    ...overrides,
    id: hasIdOverride ? overrides.id ?? null : minimalArticle.id ?? null,
    title: overrides.title ?? minimalArticle.title,
  };
}

function createFakeDb(initialArticles: Array<Partial<StoredArticle> & TestArticle> = []) {
  const docs: StoredArticle[] = initialArticles.map((entry, index) => ({
    ...article(entry),
    _id: entry._id ?? `existing-${index + 1}`,
  }));
  let nextId = 1;

  return {
    docs,
    db: {
      query: () => ({
        withIndex: (_indexName: string, callback: (query: { eq: (field: string, value: unknown) => null }) => unknown) => {
          let field = "";
          let value: unknown = null;
          callback({
            eq(nextField, nextValue) {
              field = nextField;
              value = nextValue;
              return null;
            },
          });

          return {
            async first() {
              return docs.find((doc) => (doc as Record<string, unknown>)[field] === value) ?? null;
            },
          };
        },
      }),
      async patch(id: unknown, value: Record<string, unknown>) {
        const index = docs.findIndex((doc) => doc._id === id);
        if (index === -1) {
          throw new Error(`Missing document ${String(id)}`);
        }
        docs[index] = { ...docs[index], ...value };
      },
      async insert(_table: "substanceIndex", value: Record<string, unknown>) {
        const id = `inserted-${nextId++}`;
        docs.push({ ...(value as TestArticle), _id: id });
        return id;
      },
    },
  };
}

describe("substance ingestion", () => {
  it("creates articles and reports the canonical slug and affected paths", async () => {
    const { db, docs } = createFakeDb();

    const outcome = await ingestSubstanceArticle({ db, article: article({ title: "Alpha PVP", slug: undefined }) });

    expect(outcome.action).toBe("created");
    expect(outcome.canonicalSlug).toBe("alpha-pvp");
    expect(outcome.previous).toBeNull();
    expect(outcome.next).toMatchObject({ id: 1, title: "Alpha PVP", slug: "alpha-pvp" });
    expect(outcome.affectedPaths).toEqual(["/alpha-pvp", "/substances"]);
    expect(docs).toHaveLength(1);
  });

  it("stores the parsed canonical article and strips legacy pharmacology duplicates", async () => {
    const { db, docs } = createFakeDb();
    const incoming = {
      ...article({ title: "Canonical Write", slug: "canonical-write" }),
      pharmacology: {
        ...structuredClone(minimalArticle.pharmacology),
        binding_sites: [{ target: "SERT", affinity: "Ki = 6.3 nM" }],
        receptor_profile: [{ receptor: "SERT", affinity: "Ki = 6.3 nM" }],
      },
    };

    const outcome = await ingestSubstanceArticle({ db, article: incoming });

    expect(outcome.action).toBe("created");
    expect(docs[0].pharmacology.binding_sites).toEqual([
      { target: "SERT", affinity: "Ki = 6.3 nM" },
    ]);
    expect(docs[0].pharmacology).not.toHaveProperty("receptor_profile");
  });

  it("updates by article ID", async () => {
    const { db, docs } = createFakeDb([article({ id: 7, title: "Old Title", slug: "old-title" })]);

    const outcome = await ingestSubstanceArticle({ db, article: article({ id: 7, title: "New Title", slug: "new-title" }) });

    expect(outcome.action).toBe("updated");
    expect(outcome.previous).toMatchObject({ id: 7, title: "Old Title", slug: "old-title" });
    expect(outcome.next).toMatchObject({ id: 7, title: "New Title", slug: "new-title" });
    expect(outcome.affectedPaths).toEqual(["/new-title", "/old-title", "/substances"]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: 7, title: "New Title", slug: "new-title" });
  });

  it("updates by slug when article ID is null", async () => {
    const { db, docs } = createFakeDb([article({ id: null, title: "No ID", slug: "no-id" })]);

    const outcome = await ingestSubstanceArticle({ db, article: article({ id: null, title: "No ID Updated", slug: "no-id" }) });

    expect(outcome.action).toBe("updated");
    expect(outcome.convexId).toBe("existing-1");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: null, title: "No ID Updated", slug: "no-id" });
  });

  it("updates by previous slug when the submitted article ID changed", async () => {
    const { db, docs } = createFakeDb([article({ id: 10, title: "Legacy ID", slug: "same-slug" })]);

    const outcome = await ingestSubstanceArticle({ db, article: article({ id: 11, title: "New ID", slug: "same-slug" }) });

    expect(outcome.action).toBe("updated");
    expect(outcome.previous).toMatchObject({ id: 10, title: "Legacy ID", slug: "same-slug" });
    expect(outcome.next).toMatchObject({ id: 11, title: "New ID", slug: "same-slug" });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: 11, title: "New ID", slug: "same-slug" });
  });

  it("skips slug collisions instead of overwriting another article", async () => {
    const { db, docs } = createFakeDb([
      article({ id: 1, title: "First", slug: "first" }),
      article({ id: 2, title: "Second", slug: "second" }),
    ]);

    const outcome = await ingestSubstanceArticle({ db, article: article({ id: 1, title: "First", slug: "second" }) });

    expect(outcome.action).toBe("skipped");
    expect(outcome.error).toContain('Slug "second" already belongs to "Second"');
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ id: 1, title: "First", slug: "first" });
    expect(docs[1]).toMatchObject({ id: 2, title: "Second", slug: "second" });
  });

  it("skips invalid articles with validation diagnostics", async () => {
    const { db, docs } = createFakeDb();

    const outcome = await ingestSubstanceArticle({
      db,
      article: { id: null, title: "Invalid", slug: "invalid" } as never,
    });

    expect(outcome.action).toBe("skipped");
    expect(outcome.error).toContain("Invalid structure");
    expect(outcome.validationErrors.length).toBeGreaterThan(0);
    expect(docs).toHaveLength(0);
  });

  it("returns mixed batch partial success results", async () => {
    const { db } = createFakeDb([article({ id: 5, title: "Existing", slug: "existing" })]);

    const result = await ingestSubstanceArticles({
      db,
      articles: [
        article({ id: 6, title: "Created", slug: "created" }),
        article({ id: 5, title: "Updated", slug: "updated" }),
        { id: null, title: "Invalid", slug: "invalid" } as never,
      ],
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.outcomes.map((outcome) => outcome.action)).toEqual(["created", "updated", "skipped"]);
    expect(result.affectedPaths).toEqual(["/created", "/existing", "/substances", "/updated"]);
  });
});
