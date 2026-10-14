import { describe, expect, it } from "vitest";
import { parsePublicSubstanceLibraryInputRecords } from "../../../lib/data/publicData.substanceContract";
import { projectLibraryInput } from "../projections/substanceReadProjections";
import type { SubstanceArticle } from "@/schema";
import { minimalArticle } from "@/test/fixtures/articles";
import { buildLibrary } from "./libraryBuilder";
import { parseManualConfig } from "./manualIndexLoader";
import { buildSearchIndexFromLibrary } from "./search";
import { buildSearchManifestIndex, createSearchManifest } from "./searchManifest";

const emptyConfig = parseManualConfig({
  version: 1,
  categories: [{ key: "miscellaneous", label: "Miscellaneous", iconKey: "sparkles", drugs: [], sections: [] }],
});

const article = (name: string, casNumber: string): SubstanceArticle => ({
  ...structuredClone(minimalArticle),
  title: name,
  identification: {
    ...structuredClone(minimalArticle.identification),
    common_name: name,
    cas_number: casNumber,
  },
});

const searchSurfaces = (articles: SubstanceArticle[]) => {
  const publicArticles = parsePublicSubstanceLibraryInputRecords(articles.map(projectLibraryInput));
  const library = buildLibrary(publicArticles, {
    psychoactive: emptyConfig,
    chemical: emptyConfig,
    mechanism: emptyConfig,
  });
  const server = buildSearchIndexFromLibrary(library);
  const payload = createSearchManifest(server);
  const browser = buildSearchManifestIndex(JSON.parse(JSON.stringify(payload)));
  return { server, browser, payload };
};

describe("CAS substance lookup", () => {
  it("never falls back to name aliases for invalid, incomplete or hyphenless CAS input", () => {
    const invalidInputs = ["63547-13-8", "63547-13", "63 547-13-7", "63547137"];
    const decoy = article("Identifier text", "63547-13-8");
    decoy.identification.alternative_names = invalidInputs;
    const { server, browser } = searchSurfaces([article("Adrafinil", "63547-13-7"), decoy]);

    for (const query of invalidInputs) {
      expect(server.query(query), query).toEqual([]);
      expect(browser.query(query), query).toEqual([]);
    }
    expect(server.query("64-17-5")).toEqual([]);
    expect(server.query("identifier text")[0]?.slug).toBe("identifier-text");
  });

  it("returns every eligible duplicate without exposing hidden or direct-URL-only records", () => {
    const casNumber = "52237-19-1";
    const hidden = { ...article("Hidden fixture", casNumber), index_categories: ["hidden"] };
    const low = { ...article("Low fixture", casNumber), priority: "low" as const };
    const hideForNow = { ...article("Hide for now fixture", casNumber), priority: "hide_for_now" as const };
    const { server, browser, payload } = searchSurfaces([
      article("Fluorophenibut", casNumber),
      article("F-Phenibut", casNumber),
      hidden,
      low,
      hideForNow,
    ]);

    expect(server.query(casNumber).map(({ slug }) => slug)).toEqual(["f-phenibut", "fluorophenibut"]);
    expect(browser.query(casNumber).map(({ slug }) => slug)).toEqual(["f-phenibut", "fluorophenibut"]);
    expect(browser.query(casNumber, { limit: 1 }).map(({ slug }) => slug)).toEqual(["f-phenibut"]);
    expect(payload.entries.filter(({ type }) => type === "substance").map(({ slug }) => slug))
      .toEqual(["fluorophenibut", "f-phenibut"]);
  });
});
