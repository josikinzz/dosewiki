import { describe, expect, it } from "vitest";
import yaml from "yaml";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { parseGeneratedYaml } from "./yamlParser";

describe("parseGeneratedYaml", () => {
  it("preserves legacy pharmacology data when hydrating an existing article", () => {
    const legacyArticle = {
      ...createEmptyArticle(),
      id: 101,
      title: "1B-LSD",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "1B-LSD",
      },
      pharmacology: {
        mechanism_of_action: [
          "5-HT2A receptor agonist (partial)",
          "5-HT2C receptor agonist (partial)",
        ],
        receptor_binding: {
          "NMDA receptor": "antagonist",
        },
        metabolism: "Rapid hepatic metabolism.",
        metabolites: ["M1"],
        route_bioavailability: {
          oral: "70%",
        },
        route_half_life: {
          oral: "3 hours",
        },
      },
    };

    const result = parseGeneratedYaml(yaml.stringify(legacyArticle, { lineWidth: 0, nullStr: "" }));

    expect(result.success).toBe(true);
    expect(result.data?.pharmacology.pharmacokinetics).toBe("Rapid hepatic metabolism.");
    expect(result.data?.pharmacology.route_bioavailability).toEqual({ Oral: "70%" });
    expect(result.data?.pharmacology.route_half_life).toEqual({ Oral: "3 hours" });
    expect(result.data?.pharmacology.receptor_profile).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "5-HT2A receptor agonist (partial)" }),
        expect.objectContaining({ tag: "5-HT2C receptor agonist (partial)" }),
        expect.objectContaining({ receptor: "NMDA receptor", efficacy: "antagonist" }),
      ]),
    );
  });
});
