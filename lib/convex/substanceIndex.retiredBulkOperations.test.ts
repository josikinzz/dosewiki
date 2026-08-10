import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(`${process.cwd()}/convex/substanceIndex.ts`, "utf8");

function exportedOperationBlock(name: string, constructor: "query" | "internalMutation"): string {
  const start = source.indexOf(`export const ${name} = ${constructor}({`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

describe("retired whole-corpus substance operations", () => {
  it.each(["getAll", "getEditorAll"])("fails %s before any database read", (name) => {
    const block = exportedOperationBlock(name, "query");
    expect(block).toContain('code: "BOUNDED_PAGINATION_REQUIRED"');
    expect(block).toContain("RETIRED_CORPUS_OPERATION_MESSAGE");
    expect(block).not.toContain("ctx.db");
    expect(block).not.toContain(".collect(");
  });

  it("fails whole-corpus replacement before collect, delete, or insert", () => {
    const block = exportedOperationBlock("replaceAllSubstances", "internalMutation");
    expect(block).toContain('code: "BULK_REPLACEMENT_RETIRED"');
    expect(block).toContain("RETIRED_CORPUS_OPERATION_MESSAGE");
    expect(block).not.toContain("ctx.db");
    expect(block).not.toContain(".collect(");
    expect(block).not.toContain(".delete(");
    expect(block).not.toContain(".insert(");
    expect(block).not.toContain("prepareSubstanceReplacementArticles");
  });
});
