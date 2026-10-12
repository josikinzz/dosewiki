import { vi } from "vitest";

export type Row = {
  _id: string;
  email: string;
  username?: string;
  role: "admin" | "editor_translator" | "editor" | "translator" | "contributor" | "viewer";
  glossaryLocales?: string[];
  name?: string;
  passwordHash?: string;
  passwordUpdatedAt?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
  invitedBy?: string;
  bannedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
};

/**
 * In-memory memberships table supporting the indexes the module uses
 * (`by_email`, `by_username`, `by_role`, `by_reset_token_hash`) plus an
 * unindexed `collect` for the roster. `requireRole` reads `by_email` too.
 */
export function createCtx(seed: Row[]) {
  const rows = new Map(seed.map((row) => [row._id, { ...row }]));
  let nextId = seed.length + 1;

  const query = (_table: string) => ({
    withIndex: (
      indexName: string,
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
      const matches = () => [...rows.values()].filter((row) => row[field as keyof Row] === value);
      return {
        unique: async () => {
          const found = matches();
          if (found.length > 1) {
            throw new Error(`${indexName} returned ${found.length} rows`);
          }
          return found[0] ?? null;
        },
        collect: async () => matches(),
      };
    },
    collect: async () => [...rows.values()],
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        normalizeId: () => null, // This fixture contains membership rows only.
        query: vi.fn(query),
        patch: vi.fn(async (id: string, patch: Partial<Row>) => {
          const next = { ...rows.get(id)!, ...patch };
          for (const key of Object.keys(patch) as (keyof Row)[]) {
            if (patch[key] === undefined) {
              delete next[key];
            }
          }
          rows.set(id, next);
        }),
        insert: vi.fn(async (_table: string, doc: Omit<Row, "_id">) => {
          const _id = `m${nextId++}`;
          rows.set(_id, { _id, ...doc });
          return _id;
        }),
        delete: vi.fn(async (id: string) => {
          rows.delete(id);
        }),
      },
    } as never,
    rows,
  };
}

