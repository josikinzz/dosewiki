import { describe, expect, it, vi } from "vitest";
import { save } from "./saveArticleBatch";
import type { MutationCtx } from "../lib/postgres/runtime/server";
import { getFunctionName } from "../lib/postgres/runtime/api";

vi.mock("server-only", () => ({}));
vi.mock("./lib/auth", () => ({ requireRole: vi.fn(async () => ({})) }));

const article = { id: 1, title: "LSD", slug: "lsd" };
const layout = { type: "chemical" as const, version: 2, categories: [], expected: null, expectedRevision: 0, operationId: "layout-operation" };
const changelog = { entryId: "entry-id", createdAt: "2026-09-22T00:00:00.000Z", message: "Changed LSD", markdown: "Changed LSD", submittedBy: "EDITOR", articles: [article] };

describe("saveArticleBatch", () => {
  it("propagates a later layout failure after the article write for transaction rollback", async () => {
    const calls: string[] = [];
    const runMutation = vi.fn(async (reference: unknown) => {
      const name = getFunctionName(reference as never);
      calls.push(name);
      if (name === "substanceIndex:saveSubstances") return { created: 0, updated: 1, errors: [] };
      throw new Error("layout write failed");
    });

    await expect(save._handler({ runMutation } as unknown as MutationCtx, {
      apiKey: "token", actorEmail: "editor@example.com", articles: [article], indexLayouts: [layout], changelog,
    } as never)).rejects.toThrow("layout write failed");
    expect(calls).toEqual(["substanceIndex:saveSubstances", "indexLayouts:save"]);
  });

  it("aborts when ingestion reports an article error after an earlier article write", async () => {
    const runMutation = vi.fn(async () => ({ created: 0, updated: 1, errors: ["Second article: invalid dosage"] }));

    await expect(save._handler({ runMutation } as unknown as MutationCtx, {
      apiKey: "token", actorEmail: "editor@example.com", articles: [article, { id: 2, title: "Second", slug: "second" }], indexLayouts: [layout], changelog,
    } as never)).rejects.toThrow("Article save failed: Second article: invalid dosage");
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});
