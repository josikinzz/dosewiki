import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { buildTagRegistry } from "./tagRegistry";

describe("buildTagRegistry", () => {
  it("indexes legacy mechanism tags when receptor_profile is missing", () => {
    const article = createEmptyArticle() as ReturnType<typeof createEmptyArticle> & {
      id: number;
      pharmacology: ReturnType<typeof createEmptyArticle>["pharmacology"] & {
        mechanism_of_action: string[];
        receptor_binding: Record<string, never>;
        metabolism: string;
      };
    };

    article.id = 5;
    article.title = "Legacy Substance";
    article.identification.common_name = "Legacy Substance";
    article.pharmacology = {
      ...article.pharmacology,
      mechanism_of_action: ["5-HT2A receptor agonist"],
      receptor_binding: {},
      metabolism: "",
      metabolites: [],
    };

    const registry = buildTagRegistry([article]);

    expect(registry.byField.mechanism_of_action).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "5-HT2A receptor agonist", count: 1 }),
      ]),
    );
  });
});
