import { describe, expect, it } from "vitest";
import { UNQUALIFIED_MECHANISM_QUALIFIER_KEY } from "../constants";
import { parseManualConfig } from "./manualIndexLoader";
import {
  createManualLayoutTaxonomy,
  createTaxonomyIdentifier,
  parseQualifiedTaxonomyLabel,
  resolveRouteTaxonomy,
} from "./taxonomy";

describe("taxonomy module", () => {
  it("resolves canonical route labels, aliases, and composite route descriptors", () => {
    expect(resolveRouteTaxonomy("i.v.").canonicalRoutes).toEqual(["intravenous"]);
    expect(resolveRouteTaxonomy("oral / sublingual (blotter)").canonicalRoutes).toEqual([
      "oral",
      "sublingual",
    ]);
    expect(resolveRouteTaxonomy("smoked and vaporized routes").canonicalRoutes).toEqual([
      "smoked",
      "vaporized",
    ]);
  });

  it("parses mechanism qualifiers into canonical keys", () => {
    expect(parseQualifiedTaxonomyLabel("5-HT2A receptor agonist (partial agonist)")).toEqual({
      base: "5-HT2A receptor agonist",
      qualifier: "partial agonist",
      qualifierKey: "partial-agonist",
    });

    expect(parseQualifiedTaxonomyLabel("Dopamine releaser")).toEqual({
      base: "Dopamine releaser",
      qualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
    });
  });

  it("builds manual-layout taxonomy aliases and fallback category policy", () => {
    const config = parseManualConfig({
      version: 1,
      categories: [
        {
          key: "classic-psychedelics",
          label: "Classic Psychedelics",
          iconKey: "sparkles",
          drugs: [],
          sections: [],
        },
        {
          key: "miscellaneous",
          label: "Miscellaneous",
          iconKey: "circle",
          drugs: [],
          sections: [],
        },
      ],
    });

    const taxonomy = createManualLayoutTaxonomy(config);

    expect(taxonomy.categoryLookup.get("classic-psychedelics")?.label).toBe(
      "Classic Psychedelics",
    );
    expect(taxonomy.categoryLookup.get("classic-psychedelics")?.key).toBe(
      "classic-psychedelics",
    );
    expect(taxonomy.fallbackCategoryKey).toBe("miscellaneous");
  });

  it("leaves fallback category unset when a Postgres layout omits miscellaneous", () => {
    const config = parseManualConfig({
      version: 1,
      categories: [
        {
          key: "configured-empty",
          label: "Configured Empty",
          iconKey: "circle",
          drugs: [],
          sections: [],
        },
      ],
    });

    expect(createManualLayoutTaxonomy(config).fallbackCategoryKey).toBeNull();
  });

  it("creates route intent for public taxonomy surfaces", () => {
    expect(
      createTaxonomyIdentifier("chemical", "Lysergamide", "/chemical").routeIntent?.pathname,
    ).toBe("/chemical/lysergamide");
  });
});
