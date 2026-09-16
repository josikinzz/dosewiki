import { describe, expect, it } from "vitest";
import { createDataPublicDataReadAdapter } from "./publicData.reads";

describe("public effect data adapters", () => {
  it("reads effect detail data from projected Postgres public queries", async () => {
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const query = async <Result, Args extends Record<string, unknown>>(name: string, args: Args): Promise<Result> => {
      queryCalls.push([name, args]);
      return (name.includes("BySlug") ? null : []) as Result;
    };

    const adapter = createDataPublicDataReadAdapter(query);

    await adapter.getPublicEffects();
    await adapter.getPublicEffectBySlug("visual-drifting");
    await adapter.getPublicEffectArticles();
    await adapter.getPublicEffectsByCategory("visual");

    expect(queryCalls).toEqual([
      ["subjectiveEffects:getPublicPreviews", {}],
      ["subjectiveEffects:getPublicBySlug", { slug: "visual-drifting" }],
      ["subjectiveEffects:getPublicArticles", {}],
      ["subjectiveEffects:getPublicByCategory", { category: "visual" }],
    ]);
  });

  it("normalizes public effect VCode fields and falls back to raw text for invalid AST", async () => {
    const validAst = {
      name: "paragraph",
      properties: {},
      children: ["Rendered content"],
    };
    const query = async <Result>(): Promise<Result> =>
      ({
        slug: "visual-drifting",
        name: "Visual drifting",
        summary: "Objects drift.",
        tags: ["visual"],
        description_raw: "Raw description",
        description_ast: validAst,
        analysis_raw: "Raw analysis",
        analysis_ast: { type: "doc", content: [] },
      }) as Result;

    const adapter = createDataPublicDataReadAdapter(query);
    const result = await adapter.getPublicEffectBySlug("visual-drifting");

    expect(result).toMatchObject({
      description_ast: validAst,
      analysis_raw: "Raw analysis",
    });
    expect(result?.analysis_ast).toBeUndefined();
  });
});
