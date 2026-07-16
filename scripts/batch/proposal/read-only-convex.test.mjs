import { describe, expect, it, vi } from "vitest";

import { createProposalReadApi, createQueryOnlyConvexClient } from "./read-only-convex.mjs";

class MutationCapableClient {
  query = vi.fn(async () => null);
  mutation = vi.fn(async () => null);
}

const fullApi = {
  substanceIndex: { getBySlug: "substance.get", saveSubstance: "substance.save" },
  prompts: { getByKey: "prompts.get", save: "prompts.save" },
  quotes: { getBySlugAndSection: "quotes.get", save: "quotes.save" },
  articleSources: { getBySlug: "sources.get", save: "sources.save" },
};

describe("proposal Convex read capability", () => {
  it("exposes only bound query capability even when the underlying client can mutate", async () => {
    const client = createQueryOnlyConvexClient(MutationCapableClient, "https://source-test.convex.cloud");

    expect(Object.keys(client)).toEqual(["query"]);
    expect(client).not.toHaveProperty("mutation");
    expect(Object.isFrozen(client)).toBe(true);
    await expect(client.query("substance.get", { slug: "2c-b" })).resolves.toBeNull();
  });

  it("passes adapters a frozen query-only API inventory", () => {
    const readApi = createProposalReadApi(fullApi);

    expect(readApi).toEqual({
      substanceIndex: { getBySlug: "substance.get" },
      prompts: { getByKey: "prompts.get" },
      quotes: { getBySlugAndSection: "quotes.get" },
      articleSources: { getBySlug: "sources.get" },
    });
    expect(readApi.substanceIndex).not.toHaveProperty("saveSubstance");
    expect(Object.isFrozen(readApi)).toBe(true);
    expect(Object.isFrozen(readApi.prompts)).toBe(true);
  });
});
