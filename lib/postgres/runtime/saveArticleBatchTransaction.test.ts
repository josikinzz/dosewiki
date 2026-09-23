import { describe, expect, it, vi } from "vitest";
import { PostgresClient } from "./client";
import { api } from "./api";

vi.mock("server-only", () => ({}));
vi.mock("../../../server/lib/auth", () => ({ requireRole: vi.fn(async () => ({})) }));

const events = vi.hoisted(() => [] as string[]);
const state = vi.hoisted(() => ({ failLayout: true }));

vi.mock("./functions.generated", async () => {
  const { save } = await import("../../../server/saveArticleBatch");
  const { mutation } = await import("./server");
  const { v } = await import("./values");
  const nested = (name: string, error?: string) => mutation({
    args: { apiKey: v.optional(v.string()), actorEmail: v.string(), articles: v.optional(v.any()), type: v.optional(v.any()), version: v.optional(v.any()), categories: v.optional(v.any()), expected: v.optional(v.any()), expectedRevision: v.optional(v.any()), operationId: v.optional(v.any()), entryId: v.optional(v.any()), createdAt: v.optional(v.any()), message: v.optional(v.any()), markdown: v.optional(v.any()), submittedBy: v.optional(v.any()) },
    handler: async () => {
      events.push(name);
      if (error && state.failLayout) throw new Error(error);
      if (name === "article") return { created: 0, updated: 1, errors: [] };
      return { unchanged: false };
    },
  });
  return { functionModules: {
    saveArticleBatch: { save },
    substanceIndex: { saveSubstances: nested("article") },
    indexLayouts: { save: nested("layout", "layout write failed") },
    changelog: { addEntry: nested("changelog") },
  } };
});

describe("save article transaction", () => {
  it("rolls back an earlier article write after a later layout error on the same connection", async () => {
    state.failLayout = true;
    events.length = 0;
    const sql: string[] = [];
    const query = vi.fn(async (statement: string) => { sql.push(statement); return { rows: [], rowCount: 0 }; });
    const pool = { on: vi.fn(), connect: vi.fn(async () => ({ query, release: vi.fn() })) };
    const client = new PostgresClient(pool as never);

    await expect(client.mutation(api.saveArticleBatch.save, {
      apiKey: "token", actorEmail: "editor@example.com",
      articles: [{ id: 1, title: "LSD", slug: "lsd", index_categories: [], identification: null, classification: null, summary: null, dosage: null, duration: null, subjective_effects: null, comparisons: null, pharmacology: null, interactions: null, reagent_testing: null, tolerance: null, harm_potential: null, legality: null, citations: null }],
      indexLayouts: [{ type: "chemical", version: 2, categories: [], expected: null, expectedRevision: 0, operationId: "operation" }],
      changelog: { entryId: "entry", createdAt: "2026-09-22T00:00:00.000Z", message: "Changed LSD", markdown: "Changed LSD", submittedBy: "EDITOR", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
    } as never)).rejects.toThrow("layout write failed");

    expect(events).toEqual(["article", "layout"]);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(sql.some((statement) => statement.startsWith("BEGIN ISOLATION LEVEL SERIALIZABLE"))).toBe(true);
    expect(sql).toContain("ROLLBACK");
    expect(sql).not.toContain("COMMIT");
  });

  it("commits article, layout, and changelog together", async () => {
    state.failLayout = false;
    events.length = 0;
    const sql: string[] = [];
    const query = vi.fn(async (statement: string) => { sql.push(statement); return { rows: [], rowCount: 0 }; });
    const pool = { on: vi.fn(), connect: vi.fn(async () => ({ query, release: vi.fn() })) };
    const client = new PostgresClient(pool as never);
    const article = { id: 1, title: "LSD", slug: "lsd", index_categories: [], identification: null, classification: null, summary: null, dosage: null, duration: null, subjective_effects: null, comparisons: null, pharmacology: null, interactions: null, reagent_testing: null, tolerance: null, harm_potential: null, legality: null, citations: null };

    await expect(client.mutation(api.saveArticleBatch.save, {
      apiKey: "token", actorEmail: "editor@example.com", articles: [article],
      indexLayouts: [{ type: "chemical", version: 2, categories: [], expected: null, expectedRevision: 0, operationId: "operation" }],
      changelog: { entryId: "entry", createdAt: "2026-09-22T00:00:00.000Z", message: "Changed LSD", markdown: "Changed LSD", submittedBy: "EDITOR", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
    } as never)).resolves.toMatchObject({ changelogSaved: true });

    expect(events).toEqual(["article", "layout", "changelog"]);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(sql.filter((statement) => statement.startsWith("BEGIN ISOLATION LEVEL SERIALIZABLE"))).toHaveLength(1);
    expect(sql).toContain("COMMIT");
    expect(sql).not.toContain("ROLLBACK");
  });
});
