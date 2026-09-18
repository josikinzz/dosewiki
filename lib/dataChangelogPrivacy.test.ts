import { describe, expect, it } from "vitest";
import { getAll, getRecent, getBySubmitter, getByArticleSlug } from "../server/changelog";

const historicalRow = {
  _id: "changelog-private",
  _creationTime: 1,
  entryId: "proposal-history",
  createdAt: "2026-01-01T00:00:00.000Z",
  message: "Clarify duration (proposed by writer@example.test, approved by reviewer@example.test)",
  markdown: 'Reverted "Clarify duration" (proposed by writer@example.test, applied by reviewer@example.test, reverted by admin@example.test).\n- old duration\n+ corrected duration',
  submittedBy: "writer@example.test",
  articles: [{ id: 1, title: "LSD", slug: "lsd" }],
};

function publicQueryCtx() {
  const stored = structuredClone(historicalRow);
  return {
    stored,
    ctx: {
      db: {
        query: (table: string) => {
          if (table === "publicReadIndexState") return { withIndex: () => ({ unique: async () => null }) };
          let rows = [stored];
          const cursor = {
            withIndex: (_index: string, filter?: (q: unknown) => unknown) => {
              const q = {
                eq: (field: keyof typeof stored, value: unknown) => {
                  rows = rows.filter((row) => row[field] === value);
                  return q;
                },
              };
              filter?.(q);
              return cursor;
            },
            order: () => cursor,
            collect: async () => rows,
            take: async (limit: number) => rows.slice(0, limit),
            async *[Symbol.asyncIterator]() {
              yield* rows;
            },
          };
          return cursor;
        },
      },
    },
  };
}

type RegisteredQuery = {
  _handler: (ctx: never, args: unknown) => Promise<Array<typeof historicalRow>>;
};

function handlerOf(fn: unknown) {
  // Postgres exposes the real handler at runtime but omits it from its public type.
  const registered = fn as RegisteredQuery;
  return registered._handler;
}

describe("public changelog email privacy", () => {
  it.each([
    ["all", getAll, {}],
    ["recent", getRecent, { limit: 10 }],
    ["submitter", getBySubmitter, { submitters: [historicalRow.submittedBy] }],
    ["article", getByArticleSlug, { slug: "lsd" }],
  ] as const)("redacts historical identities without dropping the %s history", async (_name, query, args) => {
    const { ctx, stored } = publicQueryCtx();
    const entries = await handlerOf(query)(ctx as never, args);

    expect(entries.map((entry) => entry.entryId)).toEqual([historicalRow.entryId]);
    expect(JSON.stringify(entries)).not.toContain("@example.test");
    expect(entries[0].submittedBy).toBeNull();
    expect(entries[0].message).toContain("Clarify duration");
    expect(entries[0].markdown).toContain("- old duration\n+ corrected duration");
    expect(entries[0].articles).toEqual(historicalRow.articles);
    expect(stored).toEqual(historicalRow);
  });
});
