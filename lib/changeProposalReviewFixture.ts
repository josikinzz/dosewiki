import { vi } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { projectEditorArticle } from "../src/data/projections/substanceReadProjections";
import { minimalArticle } from "../src/test/fixtures/articles";
import { contentHash } from "./proposals/contentHash";

// Shared in-memory Postgres fixture for the change proposal review tests.
export const SERVER_KEY = "test-admin-key";

export type Row = Record<string, unknown> & { _id: string };

/**
 * In-memory tables covering everything the review handlers and the write
 * handlers they delegate to touch: `withIndex(...).eq(field, value)` lookups,
 * the index-free `query("categoryLayout").first()` the layout mirror uses,
 * `get`, `insert`, `patch`, `replace`, and `delete`.
 */
export function createCtx(seed: Record<string, Row[]>) {
  const tables = new Map<string, Map<string, Row>>();
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, new Map(rows.map((row) => [row._id, structuredClone(row)])));
  }
  let nextId = 1;
  const rowsOf = (table: string) => {
    if (!tables.has(table)) {
      tables.set(table, new Map());
    }
    return tables.get(table)!;
  };
  const rowById = (id: string) => {
    for (const rows of tables.values()) {
      const row = rows.get(id);
      if (row) return { rows, row };
    }
    return null;
  };

  const results = (matches: Row[]) => ({
    order: (direction: "asc" | "desc" = "asc") => results([...matches].sort((left, right) => (Number(left._creationTime ?? 0) - Number(right._creationTime ?? 0)) * (direction === "desc" ? -1 : 1))),
    take: async (count: number) => matches.slice(0, count),
    first: async () => matches[0] ?? null,
    unique: async () => matches[0] ?? null,
    collect: async () => matches,
  });
  type IndexFilter = { eq: (field: string, value: unknown) => IndexFilter };
  const query = (table: string) => ({
    ...results([...rowsOf(table).values()]),
    withIndex: (
      _indexName: string,
      selector?: (query: IndexFilter) => unknown,
    ) => {
      const filters: Array<[string, unknown]> = [];
      const filter: IndexFilter = {
        eq: (name, candidate) => {
          filters.push([name, candidate]);
          return filter;
        },
      };
      selector?.(filter);
      return results([...rowsOf(table).values()].filter((row) => filters.every(([field, value]) => row[field] === value)));
    },
  });

  const db = {
    normalizeId: (table: string, id: string) => rowsOf(table).has(id) || id.startsWith(`${table}:`) ? id : null,
    query: vi.fn(query),
    get: vi.fn(async (id: string) => rowById(id)?.row ?? null),
    insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${nextId++}`;
      rowsOf(table).set(_id, { _id, _creationTime: nextId, ...doc });
      return _id;
    }),
    patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const hit = rowById(id);
      if (hit) hit.rows.set(id, { ...hit.row, ...patch });
    }),
    replace: vi.fn(async (id: string, doc: Record<string, unknown>) => {
      const hit = rowById(id);
      if (hit) hit.rows.set(id, { _id: id, _creationTime: hit.row._creationTime, ...doc });
    }),
    delete: vi.fn(async (id: string) => {
      rowById(id)?.rows.delete(id);
    }),
  };

  return {
    ctx: { auth: { getUserIdentity: vi.fn(async () => null) }, db } as unknown as MutationCtx,
    db,
    rowsOf,
  };
}

export const admin: Row = {
  _id: "m0",
  email: "admin@example.com",
  role: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
export const editor: Row = { ...admin, _id: "m1", email: "editor@example.com", role: "editor" };

export const storedLsd: Row = {
  _id: "s1",
  _creationTime: 1700000000000,
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Stored summary",
};

export const proposedLsd = {
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Proposed summary",
};

export const proposedLayout = {
  type: "psychoactive" as const,
  version: 2,
  categories: [
    {
      key: "psychedelics",
      label: "Psychedelics",
      iconKey: "psychedelics",
      sections: [{ key: "classic", label: "Classic", drugs: ["lsd"] }],
      drugs: [],
    },
  ],
};

/** What `readProposalTarget` returns for the stored article: the editor projection without system fields. */
export function liveArticleDocument(row: Row) {
  const { _id: _rowId, _creationTime: _createdAt, ...content } = projectEditorArticle(row as never) as Record<
    string,
    unknown
  >;
  return content;
}

export function proposalRow(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: "proposal_p1",
    proposedBy: "editor@example.com",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    status: "submitted",
    targets: [{ kind: "article", key: "lsd", baseHash: contentHash(liveArticleDocument(storedLsd)) }],
    payload: { articles: [proposedLsd] },
    summary: "Update LSD",
    diff: "# LSD\n\n- Stored summary\n+ Proposed summary",
    comments: [],
    ...overrides,
  };
}

export const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com", proposalId: "proposal_p1" as never };
export const asEditor = { ...asAdmin, actorEmail: "editor@example.com" };
