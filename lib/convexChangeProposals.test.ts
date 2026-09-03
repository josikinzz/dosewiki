import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countHandler, listMineHandler, submitHandler } from "../convex/changeProposals";
import { deriveProposalTargets } from "../convex/lib/changeProposalTargets";
import { projectEditorArticle } from "../convex/lib/substanceReadProjections";
import { minimalArticle } from "../src/test/fixtures/articles";
import { contentHash } from "./proposals/contentHash";

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };

/**
 * In-memory tables with the `withIndex(...).eq(field, value)` shape every
 * handler under test uses: `memberships.by_email` for `requireRole`,
 * `substanceIndex.by_slug`, `indexLayouts.by_type`, and the two
 * `changeProposals` indexes.
 */
function createCtx(seed: Record<string, Row[]>) {
  const tables = new Map<string, Map<string, Row>>();
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, new Map(rows.map((row) => [row._id, { ...row }])));
  }
  let nextId = 1;
  const rowsOf = (table: string) => {
    if (!tables.has(table)) {
      tables.set(table, new Map());
    }
    return tables.get(table)!;
  };

  const query = (table: string) => ({
    withIndex: (
      _indexName: string,
      selector: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => {
      let field = "";
      let value: unknown;
      selector({
        eq: (name, candidate) => {
          field = name;
          value = candidate;
          return {};
        },
      });
      let matches = [...rowsOf(table).values()].filter((row) => row[field] === value);
      const api = {
        order: (direction: "asc" | "desc") => {
          if (direction === "desc") {
            matches = [...matches].reverse();
          }
          return api;
        },
        take: async (count: number) => matches.slice(0, count),
        first: async () => matches[0] ?? null,
        unique: async () => {
          if (matches.length > 1) {
            throw new Error(`${_indexName} returned ${matches.length} rows`);
          }
          return matches[0] ?? null;
        },
        collect: async () => matches,
      };
      return api;
    },
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        query: vi.fn(query),
        insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
          const _id = `${table}:${nextId++}`;
          rowsOf(table).set(_id, { _id, ...doc });
          return _id;
        }),
        patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          for (const rows of tables.values()) {
            const existing = rows.get(id);
            if (existing) {
              rows.set(id, { ...existing, ...patch });
            }
          }
        }),
      },
    } as never,
    rowsOf,
  };
}

const editor: Row = {
  _id: "m1",
  email: "editor@example.com",
  role: "editor",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const contributor: Row = { ...editor, _id: "m2", email: "contributor@example.com", role: "contributor" };

const storedLsd: Row = {
  _id: "s1",
  _creationTime: 1700000000000,
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Stored summary",
};

const proposedLsd = {
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Proposed summary",
};

function submitArgs(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: SERVER_KEY,
    actorEmail: "editor@example.com",
    payload: { articles: [proposedLsd] },
    summary: "Update LSD",
    diff: "# LSD\n\n- Stored summary\n+ Proposed summary",
    targets: [{ kind: "article", key: "lsd" }],
    ...overrides,
  };
}

describe("changeProposals.submit", () => {
  beforeEach(() => {
    process.env.CONVEX_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
  });

  it("stores an editor's proposal as submitted with the base hash of the production row", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    const result = await submitHandler(ctx, submitArgs() as never);

    expect(result).toEqual({ proposalId: "changeProposals:1" });
    const stored = rowsOf("changeProposals").get("changeProposals:1")!;
    const { _id: _rowId, _creationTime: _createdAt, ...storedContent } = projectEditorArticle(storedLsd as never) as Record<string, unknown>;
    expect(stored).toMatchObject({
      proposedBy: "editor@example.com",
      status: "submitted",
      summary: "Update LSD",
      diff: "# LSD\n\n- Stored summary\n+ Proposed summary",
      comments: [],
      targets: [{ kind: "article", key: "lsd", baseHash: contentHash(storedContent) }],
      payload: { articles: [proposedLsd] },
    });
    expect(stored.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(stored.updatedAt).toBe(stored.createdAt);
    expect(stored.targets[0].baseHash).not.toBe(contentHash(proposedLsd));
  });

  it("hashes a missing production row as null so a new article proposal records absence", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor] });

    await submitHandler(ctx, submitArgs({
      payload: { articles: [{ ...proposedLsd, id: null, title: "New Thing", slug: "new-thing" }] },
      targets: [{ kind: "article", key: "new-thing" }],
    }) as never);

    expect(rowsOf("changeProposals").get("changeProposals:1")!.targets).toEqual([
      { kind: "article", key: "new-thing", baseHash: contentHash(null) },
    ]);
  });

  it("hashes an index layout target from the stored layout without system fields", async () => {
    const layout = {
      _id: "l1",
      _creationTime: 1,
      type: "chemical",
      version: 3,
      categories: [{ key: "phen", label: "Phenethylamines", iconKey: "x", drugs: ["mdma"], sections: [] }],
    };
    const { ctx, rowsOf } = createCtx({ memberships: [editor], indexLayouts: [layout] });

    await submitHandler(ctx, submitArgs({
      payload: { indexLayouts: [{ type: "chemical", version: 4, categories: [] }] },
      targets: [{ kind: "indexLayout", key: "chemical" }],
    }) as never);

    const { _id: _rowId, _creationTime: _createdAt, ...content } = layout;
    expect(rowsOf("changeProposals").get("changeProposals:1")!.targets).toEqual([
      { kind: "indexLayout", key: "chemical", baseHash: contentHash(content) },
    ]);
  });

  it("refuses a contributor", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [contributor], substanceIndex: [storedLsd] });

    await expect(
      submitHandler(ctx, submitArgs({ actorEmail: "contributor@example.com" }) as never),
    ).rejects.toThrow("Editor access required");
    expect(rowsOf("changeProposals").size).toBe(0);
  });

  it("rejects an article that fails the ingestion contract before storing anything", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const invalid = {
      ...proposedLsd,
      pharmacology: { ...proposedLsd.pharmacology, binding_sites: [{ target: "5-HT2A", tag: 42 }] },
    };

    await expect(
      submitHandler(ctx, submitArgs({ payload: { articles: [invalid] } }) as never),
    ).rejects.toThrow(/binding_sites/);
    expect(rowsOf("changeProposals").size).toBe(0);
  });

  it("rejects an empty payload and a payload whose rows the targets do not name", async () => {
    const { ctx } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    await expect(
      submitHandler(ctx, submitArgs({ payload: {}, targets: [] }) as never),
    ).rejects.toThrow(/at least one article/);
    await expect(
      submitHandler(ctx, submitArgs({ targets: [{ kind: "article", key: "other" }] }) as never),
    ).rejects.toThrow(/no target names it/);
    await expect(
      submitHandler(ctx, submitArgs({ summary: "   " }) as never),
    ).rejects.toThrow(/Summary must be/);
  });
});

describe("changeProposals reads", () => {
  beforeEach(() => {
    process.env.CONVEX_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
  });

  it("lists only the actor's proposals, newest first, without payload or diff", async () => {
    const { ctx } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    await submitHandler(ctx, submitArgs({ summary: "First" }) as never);
    await submitHandler(ctx, submitArgs({ summary: "Second" }) as never);
    await submitHandler(ctx, submitArgs({ actorEmail: undefined, summary: "Script" }) as never);

    const mine = await listMineHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com" });

    expect(mine.map((row) => row.summary)).toEqual(["Second", "First"]);
    expect(mine[0]).toMatchObject({ status: "submitted", commentCount: 0, proposedBy: "editor@example.com" });
    expect(mine[0]).not.toHaveProperty("payload");
    expect(mine[0]).not.toHaveProperty("diff");
  });

  it("counts submitted proposals for editors and refuses contributors", async () => {
    const { ctx } = createCtx({ memberships: [editor, contributor], substanceIndex: [storedLsd] });
    await submitHandler(ctx, submitArgs() as never);

    await expect(countHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com" })).resolves.toEqual({
      submitted: 1,
    });
    await expect(
      countHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "contributor@example.com" }),
    ).rejects.toThrow("Editor access required");
  });
});

describe("deriveProposalTargets", () => {
  it("names one article target per slug and one layout target per type", () => {
    expect(
      deriveProposalTargets({
        articles: [proposedLsd, { ...proposedLsd, id: 2, title: "Ketamine HCl", slug: undefined }],
        indexLayouts: [{ type: "psychoactive" }],
      }),
    ).toEqual([
      { kind: "article", key: "lsd" },
      { kind: "article", key: "ketamine-hcl" },
      { kind: "indexLayout", key: "psychoactive" },
    ]);
  });
});
