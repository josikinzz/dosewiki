import { vi } from "vitest";

// In-memory Postgres fixture for the change proposal submit and read tests.
export type Row = Record<string, unknown> & { _id: string };
type IndexFilter = { eq: (field: string, value: unknown) => IndexFilter };

/**
 * In-memory tables with the `withIndex(...).eq(field, value)` shape every
 * handler under test uses: `memberships.by_email` for `requireRole`,
 * `substanceIndex.by_slug` and `by_article_id`, `indexLayouts.by_type`, and
 * the `changeProposals` indexes, plus the bare `query(table).order(...)` walk
 * the queue list takes.
 */
export function createCtx(seed: Record<string, Row[]>) {
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

  const scan = (rows: Row[]) => {
    let matches = rows;
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
          throw new Error(`index returned ${matches.length} rows`);
        }
        return matches[0] ?? null;
      },
      collect: async () => matches,
    };
    return api;
  };

  const query = (table: string) => ({
    ...scan([...rowsOf(table).values()]),
    withIndex: (
      _indexName: string,
      selector: (query: IndexFilter) => unknown,
    ) => {
      const conditions: Array<[string, unknown]> = [];
      const indexQuery: IndexFilter = {
        eq: (field: string, value: unknown) => {
          conditions.push([field, value]);
          return indexQuery;
        },
      };
      selector(indexQuery);
      return scan([...rowsOf(table).values()].filter((row) => conditions.every(([field, value]) => row[field] === value)));
    },
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        query: vi.fn(query),
        get: vi.fn(async (id: string) => {
          for (const rows of tables.values()) {
            const existing = rows.get(id);
            if (existing) {
              return existing;
            }
          }
          return null;
        }),
        insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
          const _id = `${table}:${nextId++}`;
          rowsOf(table).set(_id, { _id, _creationTime: nextId, ...doc });
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
