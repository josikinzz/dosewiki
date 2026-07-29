import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "convex/articleSources.ts"), "utf8");

describe("articleSources query security", () => {
  it("authenticates every source-content query", () => {
    for (const queryName of ["getBySlug", "getSubstanceList", "getAll"]) {
      const start = source.indexOf(`export const ${queryName} = query(`);
      const end = source.indexOf("\n});", start);
      const queryDefinition = source.slice(start, end);

      expect(start, `${queryName} query exists`).toBeGreaterThanOrEqual(0);
      expect(queryDefinition).toContain("apiKey: v.optional(v.string())");
      expect(queryDefinition).toContain('requireAuth(ctx, args.apiKey, "articleSourceMigration")');
    }
  });
});
