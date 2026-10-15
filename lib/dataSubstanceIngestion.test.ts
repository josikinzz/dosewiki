import { describe, expect, it } from "vitest";
import {
  ingestSubstanceArticle,
  ingestSubstanceArticles,
  prepareSubstanceReplacementArticles,
} from "../server/lib/substanceIngestion";
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
  it("rejects bulk replacement when normalized incoming article ids are duplicated", () => {
    expect(() => prepareSubstanceReplacementArticles({
      articles: [
        article({ id: 7, title: "First incoming", slug: "first-incoming" }),
        article({ id: 7, title: "Second incoming", slug: "second-incoming" }),
      ],
      existing: [],
    })).toThrow("Cannot prepare substance replacement: incoming article id 7 is duplicated.");
  });

  it("rejects bulk replacement when incoming explicit slugs are duplicated", () => {
    expect(() => prepareSubstanceReplacementArticles({
      articles: [
        article({ id: 7, title: "First incoming", slug: "duplicate-incoming" }),
        article({ id: 8, title: "Second incoming", slug: "duplicate-incoming" }),
      ],
      existing: [],
    })).toThrow(
      'Cannot prepare substance replacement: incoming explicit slug "duplicate-incoming" is duplicated.',
    );
  });

  it("rejects bulk replacement when generated and effective slugs collide", () => {
    expect(() => prepareSubstanceReplacementArticles({
      articles: [
        article({ id: 7, title: "Generated Collision", slug: undefined }),
        article({ id: 8, title: "Different title", slug: "generated-collision" }),
      ],
      existing: [],
    })).toThrow(
      'Cannot prepare substance replacement: incoming effective slug "generated-collision" is duplicated.',
    );
  });

  it("rejects bulk replacement when stored article ids are duplicated", () => {
    const incoming = article({ id: 7, title: "Incoming", slug: "incoming" });

    expect(() => prepareSubstanceReplacementArticles({
      articles: [incoming],
      existing: [
        { ...article({ id: 7, title: "First", slug: "first" }), _id: "stored-1" },
        { ...article({ id: 7, title: "Second", slug: "second" }), _id: "stored-2" },
      ],
    })).toThrow("Cannot prepare substance replacement: stored article id 7 is duplicated.");
  });

  it("rejects bulk replacement when stored article slugs are duplicated", () => {
    const incoming = article({ id: 7, title: "Incoming", slug: "duplicate" });

    expect(() => prepareSubstanceReplacementArticles({
      articles: [incoming],
      existing: [
        { ...article({ id: 7, title: "First", slug: "duplicate" }), _id: "stored-1" },
        { ...article({ id: 8, title: "Second", slug: "duplicate" }), _id: "stored-2" },
      ],
    })).toThrow('Cannot prepare substance replacement: stored article slug "duplicate" is duplicated.');
  });

  it("rejects bulk replacement when incoming id and slug resolve to different stored articles", () => {
    const incoming = article({ id: 7, title: "Incoming", slug: "second" });

    expect(() => prepareSubstanceReplacementArticles({
      articles: [incoming],
      existing: [
        { ...article({ id: 7, title: "First", slug: "first" }), _id: "stored-1" },
        { ...article({ id: 8, title: "Second", slug: "second" }), _id: "stored-2" },
      ],
    })).toThrow(
      'Cannot prepare substance replacement for "Incoming": id 7 and slug "second" resolve to different stored articles.',
    );
  });

  it("skips slug collisions instead of overwriting another article", async () => {
    const { db, docs } = createFakeDb([
      article({ id: 1, title: "First", slug: "first" }),
      article({ id: 2, title: "Second", slug: "second" }),
    ]);

    const outcome = await ingestSubstanceArticle({ db, article: article({ id: 1, title: "First", slug: "second" }) });

    expect(outcome.action).toBe("skipped");
    expect(outcome.error).toContain('Slug "second" already belongs to "Second"');
    expect(outcome.affectedPaths).toEqual([]);
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

  it("writes nothing from a batch with an invalid article and reports its errors", async () => {
    const { db, docs } = createFakeDb([article({ id: 5, title: "Existing", slug: "existing" })]);
    const before = structuredClone(docs);

    const result = await ingestSubstanceArticles({
      db,
      articles: [
        article({ id: 6, title: "Created", slug: "created" }),
        article({ id: 5, title: "Updated", slug: "updated" }),
        { id: null, title: "Invalid", slug: "invalid" } as never,
      ],
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Article Invalid: Invalid structure");
    expect(result.affectedPaths).toEqual([]);
    expect(docs).toEqual(before);
  });

  it("fails the whole batch, naming the article, when a write throws", async () => {
    const { db } = createFakeDb();
    let inserts = 0;
    const failing = {
      ...db,
      async insert(table: "substanceIndex", value: Record<string, unknown>) {
        inserts += 1;
        if (inserts === 2) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
        return db.insert(table, value);
      },
    };

    const rejection = ingestSubstanceArticles({
      db: failing,
      articles: [
        article({ id: 6, title: "First", slug: "first" }),
        article({ id: 7, title: "Second", slug: "second" }),
        article({ id: 8, title: "Third", slug: "third" }),
      ],
    });
    await expect(rejection).rejects.toThrow("Substance Second: duplicate key value violates unique constraint");
    await expect(rejection).rejects.toMatchObject({ code: "23505" });
    expect(inserts).toBe(2);
  });
});
