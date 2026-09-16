import { describe, expect, it } from "vitest";
import { getSource } from "../server/moleculeEditor";
import type { QueryCtx } from "./postgres/runtime/server";

describe("protected molecule source reads", () => {
  it("lets an admin edit chemistry before the article has a public publication", async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => ({ subject: "admin", email: "admin@example.com" }),
      },
      db: {
        query: () => ({
          withIndex: () => ({
            unique: async () => ({ email: "admin@example.com", role: "admin" }),
          }),
        }),
        getMoleculeSourceBySlug: async () => ({
          slug: "unpublished",
          title: "Unpublished",
          identification: { smiles: " CCO " },
        }),
      },
    } as unknown as QueryCtx;

    await expect(getSource._handler(ctx, { slug: "unpublished" })).resolves.toMatchObject({
      slug: "unpublished",
      smiles: "CCO",
    });
  });
});
