import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { applyTagMutation, buildTagRegistry } from "./tagRegistry";

describe("buildTagRegistry", () => {
  it("indexes legacy mechanism tags when binding_sites is missing", () => {
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
    const { binding_sites: _bindingSites, ...legacyPharmacology } = article.pharmacology;
    article.pharmacology = {
      ...legacyPharmacology,
      mechanism_of_action: ["5-HT2A receptor agonist"],
      receptor_binding: {},
      metabolism: "",
      metabolites: [],
    } as unknown as typeof article.pharmacology;

    const registry = buildTagRegistry([article]);

    expect(registry.byField.mechanism_of_action).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "5-HT2A receptor agonist", count: 1 }),
      ]),
    );
  });

  it("moves a tag between fields without mutating the original article", () => {
    const article = createEmptyArticle();
    article.id = 9;
    article.title = "Moved Substance";
    article.identification.common_name = "Moved Substance";
    article.classification.chemical_class = ["Arylcyclohexylamine"];
    article.index_categories = ["Dissociative"];

    const result = applyTagMutation([article], {
      type: "move",
      sourceField: "chemical_class",
      targetField: "index_categories",
      tag: "Arylcyclohexylamine",
      renamedTag: "Arylcyclohexylamines",
    });

    expect(article.classification.chemical_class).toEqual(["Arylcyclohexylamine"]);
    expect(result.articles[0].classification.chemical_class).toEqual([]);
    expect(result.articles[0].index_categories).toEqual([
      "Dissociative",
      "Arylcyclohexylamines",
    ]);
    expect(result.changes).toHaveLength(1);
  });

  it("moves a tag only on the articles that carry it", () => {
    const carrier = createEmptyArticle();
    carrier.id = 1;
    carrier.title = "Carrier";
    carrier.identification.common_name = "Carrier";
    carrier.classification.psychoactive_class = ["Anxiolytic"];
    const bystander = createEmptyArticle();
    bystander.id = 2;
    bystander.title = "Bystander";
    bystander.identification.common_name = "Bystander";
    bystander.classification.psychoactive_class = ["Stimulant"];
    bystander.index_categories = ["Stimulants"];

    const result = applyTagMutation([carrier, bystander], {
      type: "move",
      sourceField: "psychoactive_class",
      targetField: "index_categories",
      tag: "Anxiolytic",
      renamedTag: "Anxiolytics",
    });

    expect(result.changes.map((change) => change.index)).toEqual([0]);
    expect(result.articles[0].index_categories).toEqual(["Anxiolytics"]);
    expect(result.articles[1]).toBe(bystander);
  });
});
