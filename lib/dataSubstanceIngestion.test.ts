import { describe, expect, it } from "vitest";
import {
  ingestSubstanceArticle,
  ingestSubstanceArticles,
  prepareSubstanceReplacementArticles,
} from "../server/lib/substanceIngestion";
import { minimalArticle } from "../src/test/fixtures/articles";
import {
  classifySubstancePublicationDependency,
  mergeSubstancePublicationDependency,
} from "../src/data/projections/substancePublicationDependencies";

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

  it("does not advertise a revision or invalidation for an unchanged committed article", async () => {
    const { db } = createFakeDb();
    const input = article({ title: "Unchanged", slug: "unchanged" });
    const first = await ingestSubstanceArticle({ db, article: input });
    const replay = await ingestSubstanceArticle({ db, article: input });
    expect(first.publicRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(replay).toMatchObject({ action: "skipped", affectedPaths: [], error: null });
    expect(replay.publicRevision).toBeUndefined();
  });

  it("classifies invalidation from the projections changed by the committed article", async () => {
    const base = article({ title: "Projection dependency", slug: "projection-dependency" });

    const summaryDb = createFakeDb([base]).db;
    const summary = await ingestSubstanceArticle({
      db: summaryDb,
      article: { ...base, summary: "Changed public preview." },
    });
    expect(summary.publicationDependency).toBe("content");

    const pharmacologyDb = createFakeDb([base]).db;
    const pharmacology = await ingestSubstanceArticle({
      db: pharmacologyDb,
      article: {
        ...base,
        pharmacology: { ...base.pharmacology, summary: "Changed mechanism input." },
      },
    });
    expect(pharmacology.publicationDependency).toBe("content");

    const detailDb = createFakeDb([base]).db;
    const detail = await ingestSubstanceArticle({
      db: detailDb,
      article: { ...base, history_culture: { ...base.history_culture, content: "Changed detail prose." } },
    });
    expect(detail.publicationDependency).toBe("detail");
  });

  it("never narrows coalesced pending invalidation dependencies", () => {
    expect(mergeSubstancePublicationDependency("membership", "detail")).toBe("membership");
    expect(mergeSubstancePublicationDependency("content", "detail")).toBe("content");
    expect(mergeSubstancePublicationDependency("detail", "content")).toBe("content");
    expect(mergeSubstancePublicationDependency(undefined, "detail")).toBe("membership");
  });

  it("classifies an unowned or future field conservatively", () => {
    const before = article({ title: "Future field", slug: "future-field" });
    const after = { ...before, localeMetadata: { zh: "changed" } };
    expect(classifySubstancePublicationDependency(before as never, after as never)).toBe("membership");
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

  it("preserves rich live reference metadata and remaps incoming aliases during whole-document ingestion", async () => {
    const stored = article({ id: 7, title: "Stored", slug: "stored" });
    stored.references = [{
      id: "pmid-19322953",
      type: "journal_article",
      title: "Canonical methylphenidate study",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }, {
      id: "stored-only-reference",
      type: "webpage",
      title: "Intentionally removed reference",
      authors: ["Other Author"],
      url: "https://example.com/removed",
      sourceType: "review_literature",
      quality: "medium",
    }];
    const incoming = article({
      id: 7,
      title: "Stored",
      slug: "stored",
      summary: "Claim [cite:doi-10-1055-s-0028-1109182].",
    });
    incoming.references = [{
      id: "doi-10-1055-s-0028-1109182",
      type: "journal_article",
      title: "Canonical methylphenidate study",
      authors: [],
      doi: "10.1055/s-0028-1109182",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "fallback",
    }];
    const { db, docs } = createFakeDb([stored]);

    const outcome = await ingestSubstanceArticle({ db, article: incoming });

    expect(outcome.action).toBe("updated");
    expect(docs[0].references).toHaveLength(1);
    expect(docs[0].references[0]).toMatchObject({
      id: "pmid-19322953",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      doi: "10.1055/s-0028-1109182",
    });
    expect(docs[0].summary).toBe("Claim [cite:pmid-19322953].");
    expect(docs[0].references.some(({ id }) => id === "stored-only-reference")).toBe(false);
  });

  it("applies explicitly inspected scalar metadata during whole-document replacement", () => {
    const stored = article({ id: 7, title: "Example", slug: "example" });
    stored.references = [{
      id: "doi-example",
      type: "journal_article",
      title: "{{cite journal|title=Broken}}",
      authors: [],
      doi: "10.1000/example",
      sourceType: "unknown",
      quality: "fallback",
      metadataProvenance: [{
        kind: "fetched",
        source: "legacy-import",
        fields: ["title"],
      }],
    }];
    const incoming = structuredClone(stored);
    incoming.references[0] = {
      ...incoming.references[0],
      title: "Verified title",
      metadataProvenance: [{
        kind: "inspected",
        source: "metadata-repair",
        fields: ["title"],
      }],
    };

    const replacement = prepareSubstanceReplacementArticles({
      articles: [incoming],
      existing: [{ ...stored, _id: "stored-7" }],
    });

    expect(replacement.prepared[0].references[0]).toMatchObject({
      id: "doi-example",
      title: "Verified title",
    });
  });

  it("prepares bulk replacements with rich canonical metadata while retaining article and reference deletion semantics", () => {
    const stored = article({ id: 7, title: "Methylphenidate", slug: "methylphenidate" });
    stored.references = [{
      id: "pmid-19322953",
      type: "journal_article",
      title: "Canonical methylphenidate study",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }, {
      id: "stored-only-reference",
      type: "webpage",
      title: "Intentionally removed reference",
      authors: ["Other Author"],
      url: "https://example.com/removed",
      sourceType: "review_literature",
      quality: "medium",
    }];
    const omittedArticle = article({ id: 8, title: "Intentionally omitted article", slug: "omitted" });
    const incoming = article({
      id: 7,
      title: "Methylphenidate",
      slug: "methylphenidate",
      summary: "Claim [cite:doi-10-1055-s-0028-1109182].",
    });
    incoming.references = [{
      id: "doi-10-1055-s-0028-1109182",
      type: "journal_article",
      title: "Canonical methylphenidate study",
      authors: [],
      doi: "10.1055/s-0028-1109182",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "fallback",
    }];

    const replacement = prepareSubstanceReplacementArticles({
      articles: [incoming],
      existing: [
        { ...stored, _id: "stored-7" },
        { ...omittedArticle, _id: "stored-8" },
      ],
    });

    expect(replacement.skipped).toEqual([]);
    expect(replacement.prepared).toHaveLength(1);
    expect(replacement.prepared[0]).toMatchObject({
      id: 7,
      summary: "Claim [cite:pmid-19322953].",
      references: [expect.objectContaining({
        id: "pmid-19322953",
        authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
        doi: "10.1055/s-0028-1109182",
        quality: "high",
      })],
    });
    expect((replacement.prepared[0].references as Array<{ id: string }>).some(
      ({ id }) => id === "stored-only-reference",
    )).toBe(false);
    expect(replacement.prepared.some(({ id }) => id === 8)).toBe(false);
  });

  it("prepares an ordinary bulk replacement when id and slug resolve to the same stored article", () => {
    const stored = article({ id: 7, title: "Stored title", slug: "same-article" });
    const incoming = article({ id: 7, title: "Updated title", slug: "same-article" });

    const replacement = prepareSubstanceReplacementArticles({
      articles: [incoming],
      existing: [{ ...stored, _id: "stored-7" }],
    });

    expect(replacement.skipped).toEqual([]);
    expect(replacement.prepared).toEqual([
      expect.objectContaining({ id: 7, title: "Updated title", slug: "same-article" }),
    ]);
  });

  it("prepares an ordinary multi-article replacement after incoming identity preflight", () => {
    const replacement = prepareSubstanceReplacementArticles({
      articles: [
        article({ id: 7, title: "First incoming", slug: "first-incoming" }),
        article({ id: 8, title: "Second incoming", slug: "second-incoming" }),
      ],
      existing: [],
    });

    expect(replacement.skipped).toEqual([]);
    expect(replacement.prepared).toEqual([
      expect.objectContaining({ id: 7, slug: "first-incoming" }),
      expect.objectContaining({ id: 8, slug: "second-incoming" }),
    ]);
  });

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

  it("does not inherit stored references when a replacement document has none", async () => {
    const stored = article({ id: 7, title: "Stored", slug: "stored" });
    stored.references = [{
      id: "stored-only-reference",
      type: "webpage",
      title: "Intentionally removed reference",
      authors: ["Other Author"],
      url: "https://example.com/removed",
      sourceType: "review_literature",
      quality: "medium",
    }];
    const incoming = article({ id: 7, title: "Stored", slug: "stored" });
    incoming.references = [];
    const { db, docs } = createFakeDb([stored]);

    const outcome = await ingestSubstanceArticle({ db, article: incoming });

    expect(outcome.action).toBe("updated");
    expect(docs[0].references).toEqual([]);
  });

  it("keeps conflicting stable identities separate during replacement ingestion", async () => {
    const stored = article({ id: 7, title: "Stored", slug: "stored" });
    stored.references = [{
      id: "stored-reference",
      type: "journal_article",
      title: "Stored work",
      authors: ["Stored Author"],
      doi: "10.1000/stored",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }];
    const incoming = article({ id: 7, title: "Stored", slug: "stored" });
    incoming.references = [{
      id: "incoming-reference",
      type: "journal_article",
      title: "Incoming work",
      authors: ["Incoming Author"],
      doi: "10.1000/incoming",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }];
    const { db, docs } = createFakeDb([stored]);

    await ingestSubstanceArticle({ db, article: incoming });

    expect(docs[0].references).toEqual([expect.objectContaining({
      id: "incoming-reference",
      doi: "10.1000/incoming",
      authors: ["Incoming Author"],
    })]);
  });

  it("updates by slug when article ID is null", async () => {
    const { db, docs } = createFakeDb([article({ id: null, title: "No ID", slug: "no-id" })]);

    const outcome = await ingestSubstanceArticle({ db, article: article({ id: null, title: "No ID Updated", slug: "no-id" }) });

    expect(outcome.action).toBe("updated");
    expect(outcome.dataId).toBe("existing-1");
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
